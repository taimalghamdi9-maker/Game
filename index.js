'use strict';
require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder,
  ComponentType,
} = require('discord.js');

const db = require('./utils/database');
const games = require('./utils/gameManager');
const { drawWheel } = require('./utils/wheel');

// ============================================================
// سيرفر HTTP وهمي بسيط — فقط عشان يرضي منصات الاستضافة
// (مثل Render) اللي تطلب فتح بورت حتى لو البوت لا يحتاجه فعلياً.
// لا يؤثر على عمل البوت، مجرد "نبضة حياة" (health check) بسيطة.
// ============================================================
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🎡 بوت الروليت شغال تمام!');
}).listen(PORT, () => {
  console.log(`🌐 سيرفر الفحص الصحي شغال على المنفذ ${PORT}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

const COLOR = 0x9b8fd6;
const WIN_POINTS = 1; // نقطة لكل فوز (يمكن تعديلها)

client.once('clientReady', () => {
  console.log(`🎡 تم تسجيل الدخول باسم ${client.user.tag}`);
});

// ============================================================
// أوامر السلاش
// ============================================================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'روليت') return startLobby(interaction);
      if (interaction.commandName === 'نقاطي') return showPoints(interaction);
      if (interaction.commandName === 'المتصدرين') return showLeaderboard(interaction);
      if (interaction.commandName === 'متجر') return showShop(interaction);
      if (interaction.commandName === 'مخزوني') return showInventory(interaction);
    }

    if (interaction.isButton()) {
      const [ns, action, ...rest] = interaction.customId.split(':');
      if (ns === 'lobby') return handleLobbyButton(interaction, action);
      if (ns === 'shop') return handleShopButton(interaction, action, rest[0]);
    }
  } catch (err) {
    console.error('خطأ بمعالجة التفاعل:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '⚠️ صار خطأ غير متوقع، حاول مرة ثانية.', ephemeral: true }).catch(() => {});
    }
  }
});

// ============================================================
// إنشاء لوبي روليت
// ============================================================
async function startLobby(interaction) {
  const channelId = interaction.channelId;
  if (games.get(channelId)) {
    return interaction.reply({ content: '⚠️ فيه لعبة روليت شغالة بهذه القناة حالياً.', ephemeral: true });
  }

  const maxPlayers = interaction.options.getInteger('الحد_الاقصى') ?? 20;
  const minPlayers = Math.min(interaction.options.getInteger('الحد_الادنى') ?? 3, maxPlayers);
  const joinSeconds = interaction.options.getInteger('وقت_الانضمام') ?? 60;

  const game = games.createLobby(channelId, {
    guildId: interaction.guildId,
    hostId: interaction.user.id,
    maxPlayers,
    minPlayers,
  });
  game.endsAt = Date.now() + joinSeconds * 1000;

  games.addPlayer(channelId, {
    id: interaction.user.id,
    name: interaction.user.displayName ?? interaction.user.username,
    avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
  });

  await interaction.reply({ embeds: [lobbyEmbed(game)], components: lobbyComponents() });
  const msg = await interaction.fetchReply();
  game.messageId = msg.id;

  const timer = setInterval(async () => {
    const g = games.get(channelId);
    if (!g || g.status !== 'lobby') return clearInterval(timer);
    try {
      await msg.edit({ embeds: [lobbyEmbed(g)], components: lobbyComponents() });
    } catch (_) { /* ignore */ }

    if (Date.now() >= g.endsAt) {
      clearInterval(timer);
      await launchGame(interaction, msg, channelId);
    }
  }, 5000);

  game.timer = timer;
}

function lobbyEmbed(game) {
  const remaining = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
  const names = [...game.players.values()].map((p, i) => `${i + 1}. ${p.name}`).join('\n') || 'لا يوجد لاعبين بعد';
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎡 روليت — Infinity Games')
    .setDescription(
      `**عدد اللاعبين:** ${game.players.size}/${game.maxPlayers}\n` +
      `**تبدأ اللعبة خلال:** ${remaining} ثانية\n` +
      `**أقل عدد لازم للبدء:** ${game.minPlayers}\n\n` +
      `**اللاعبين المنضمين:**\n${names}`
    )
    .setFooter({ text: 'اضغط انضمام عشان تدخل اللعبة — آخر لاعب صامد يفوز بنقطة!' });
}

function lobbyComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lobby:join').setLabel('الانضمام').setEmoji('🎮').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lobby:leave').setLabel('الانسحاب').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lobby:start').setLabel('بدء الآن').setEmoji('⏩').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('lobby:cancel').setLabel('إلغاء').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function handleLobbyButton(interaction, action) {
  const channelId = interaction.channelId;
  const game = games.get(channelId);
  if (!game || game.status !== 'lobby') {
    return interaction.reply({ content: '⚠️ ما فيه لوبي روليت مفتوح حالياً.', ephemeral: true });
  }

  const member = {
    id: interaction.user.id,
    name: interaction.user.displayName ?? interaction.user.username,
    avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
  };

  if (action === 'join') {
    const res = games.addPlayer(channelId, member);
    if (!res.ok) {
      const msgMap = { already_joined: '✅ أنت منضم بالفعل.', full: '🚫 اللوبي مكتمل العدد.', already_started: '⚠️ اللعبة بدأت.' };
      return interaction.reply({ content: msgMap[res.reason] ?? 'تعذر الانضمام.', ephemeral: true });
    }
    return interaction.reply({ content: '✅ انضممت للعبة الروليت!', ephemeral: true });
  }

  if (action === 'leave') {
    games.removePlayer(channelId, interaction.user.id);
    return interaction.reply({ content: '🚪 انسحبت من اللوبي.', ephemeral: true });
  }

  if (action === 'start') {
    if (interaction.user.id !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) {
      return interaction.reply({ content: '⚠️ بس منشئ اللعبة أو مشرف يقدر يبدأها بدري.', ephemeral: true });
    }
    if (game.players.size < game.minPlayers) {
      return interaction.reply({ content: `⚠️ لازم ${game.minPlayers} لاعبين على الأقل عشان تبدأ.`, ephemeral: true });
    }
    await interaction.reply({ content: '⏩ جاري بدء اللعبة...', ephemeral: true });
    clearInterval(game.timer);
    const msg = await interaction.channel.messages.fetch(game.messageId);
    return launchGame(interaction, msg, channelId);
  }

  if (action === 'cancel') {
    if (interaction.user.id !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) {
      return interaction.reply({ content: '⚠️ بس منشئ اللعبة أو مشرف يقدر يلغيها.', ephemeral: true });
    }
    clearInterval(game.timer);
    games.end(channelId);
    await interaction.reply({ content: '❌ تم إلغاء اللعبة.' });
    return interaction.message.edit({ components: [] }).catch(() => {});
  }
}

// ============================================================
// تشغيل اللعبة (جولات الإقصاء)
// ============================================================
async function launchGame(interaction, lobbyMsg, channelId) {
  const game = games.get(channelId);
  if (!game) return;

  if (game.players.size < game.minPlayers) {
    games.end(channelId);
    return lobbyMsg.edit({
      embeds: [new EmbedBuilder().setColor(0xd6534f).setTitle('❌ تم إلغاء اللعبة').setDescription('العدد ما وصل الحد الأدنى المطلوب.')],
      components: [],
    }).catch(() => {});
  }

  game.status = 'running';
  await lobbyMsg.edit({
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎡 بدأت اللعبة!').setDescription(`عدد اللاعبين: **${game.players.size}**\nجاري تجهيز أول دورة...`)],
    components: [],
  }).catch(() => {});

  const channel = lobbyMsg.channel;

  while (game.players.size > 1) {
    game.round += 1;
    await runRound(channel, game);
    if (!games.get(channelId)) return; // انلغت اللعبة أثناء الجولة
  }

  const winner = [...game.players.values()][0];
  db.addPoints(game.guildId, winner.id, WIN_POINTS);
  db.recordWin(game.guildId, winner.id, game.eliminated.length + 1);
  const winnerData = db.getUser(game.guildId, winner.id);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf5c542)
        .setTitle('🏆 انتهت اللعبة!')
        .setDescription(`الفائز هو <@${winner.id}> 🎉\n\n**+${WIN_POINTS} نقطة** — رصيده الحالي: **${winnerData.points}** نقطة`)
        .setThumbnail(winner.avatarURL)
        .setFooter({ text: `عدد اللاعبين: ${game.eliminated.length + 1} — استخدم /متجر عشان تصرف نقاطك` }),
    ],
  });

  games.end(channelId);
}

async function runRound(channel, game) {
  const players = [...game.players.values()];

  // ---- تحريك العجلة ----
  const frames = 6;
  let msg = null;
  let targetIndex = Math.floor(Math.random() * players.length);
  for (let f = 0; f < frames; f++) {
    const rotation = (f / frames) * Math.PI * 6 + Math.random() * 0.4;
    const highlight = f === frames - 1 ? players[targetIndex].id : null;
    const buf = await drawWheel(players, rotation, highlight);
    const file = new AttachmentBuilder(buf, { name: 'wheel.png' });
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`🎡 الجولة ${game.round} — تدور العجلة...`)
      .setImage('attachment://wheel.png')
      .setFooter({ text: `لاعبين متبقين: ${players.length}` });

    if (!msg) {
      msg = await channel.send({ embeds: [embed], files: [file] });
    } else {
      await msg.edit({ embeds: [embed], files: [file] }).catch(() => {});
    }
    await sleep(f === frames - 1 ? 200 : 500);
  }

  const target = players[targetIndex];

  // ---- اختيار الإجراء من اللاعب المستهدف ----
  const others = players.filter(p => p.id !== target.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('round:pick').setLabel('اختيار لاعب لطرده').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('round:random').setLabel('طرد عشوائي').setEmoji('🎲').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('round:withdraw').setLabel('انسحاب').setEmoji('🚪').setStyle(ButtonStyle.Danger),
  );

  const promptEmbed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎯 وقفت العجلة عندك!')
    .setDescription(`<@${target.id}>, لديك **15 ثانية** لاختيار لاعب لطرده من اللعبة.`)
    .setThumbnail(target.avatarURL);

  await msg.edit({ embeds: [promptEmbed], files: [], components: [row] }).catch(() => {});

  let eliminatedId = null;
  let byChoice = false;

  try {
    const btn = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 15000,
      filter: (i) => i.user.id === target.id && i.customId.startsWith('round:'),
    });

    if (btn.customId === 'round:random') {
      eliminatedId = others[Math.floor(Math.random() * others.length)].id;
      await btn.update({ content: `🎲 تم اختيار طرد عشوائي!`, embeds: [], components: [] });
      byChoice = true;
    } else if (btn.customId === 'round:withdraw') {
      eliminatedId = target.id;
      await btn.update({ content: `🚪 انسحبت من اللعبة.`, embeds: [], components: [] });
    } else if (btn.customId === 'round:pick') {
      const select = new StringSelectMenuBuilder()
        .setCustomId('round:select')
        .setPlaceholder('اختر اللاعب اللي تبي تطرده')
        .addOptions(others.slice(0, 25).map(p => ({ label: p.name.slice(0, 100), value: p.id })));
      const selectRow = new ActionRowBuilder().addComponents(select);
      await btn.update({ content: 'اختر اللاعب من القائمة:', embeds: [], components: [selectRow] });

      const sel = await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 15000,
        filter: (i) => i.user.id === target.id && i.customId === 'round:select',
      }).catch(() => null);

      if (sel) {
        eliminatedId = sel.values[0];
        await sel.update({ content: `🎯 تم اختيار الطرد!`, components: [] });
        byChoice = true;
      } else {
        eliminatedId = others[Math.floor(Math.random() * others.length)].id;
        await msg.edit({ content: '⏰ خلص الوقت! تم طرد عشوائي.', components: [] }).catch(() => {});
      }
    }
  } catch (_) {
    // ما رد بالوقت -> طرد عشوائي تلقائي
    eliminatedId = others[Math.floor(Math.random() * others.length)].id;
    await msg.edit({ content: '⏰ خلص الوقت! تم طرد عشوائي تلقائياً.', embeds: [], components: [] }).catch(() => {});
  }

  const eliminatedPlayer = game.players.get(eliminatedId);
  game.players.delete(eliminatedId);
  game.eliminated.push(eliminatedPlayer);
  db.recordGamePlayed(game.guildId, eliminatedPlayer.id);
  if (byChoice) db.recordKick(game.guildId, target.id);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xd6534f)
        .setDescription(`💥 تم طرد <@${eliminatedId}> من اللعبة! باقي **${game.players.size}** لاعبين.`),
    ],
  });

  await sleep(1500);
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// ============================================================
// النقاط / المتصدرين
// ============================================================
async function showPoints(interaction) {
  const target = interaction.options.getUser('عضو') ?? interaction.user;
  const u = db.getUser(interaction.guildId, target.id);
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: target.displayName ?? target.username, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: '💎 النقاط', value: `${u.points}`, inline: true },
          { name: '🏆 الفوزات', value: `${u.wins}`, inline: true },
          { name: '🎮 عدد الألعاب', value: `${u.games}`, inline: true },
          { name: '👢 عدد مرات الطرد اللي سويتها', value: `${u.kicks}`, inline: true },
        ),
    ],
  });
}

async function showLeaderboard(interaction) {
  const top = db.getLeaderboard(interaction.guildId, 10);
  if (top.length === 0) return interaction.reply('لا يوجد بيانات بعد، ابدأ لعبة روليت أول! 🎡');
  const desc = top.map((u, i) => `**${i + 1}.** <@${u.user_id}> — 💎 ${u.points} نقطة | 🏆 ${u.wins} فوز`).join('\n');
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🏅 المتصدرين').setDescription(desc)] });
}

// ============================================================
// المتجر والمخزون
// ============================================================
async function showShop(interaction) {
  const items = db.getShopItems();
  const u = db.getUser(interaction.guildId, interaction.user.id);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🛒 متجر خصائص Infinity')
    .setDescription(`رصيدك الحالي: **${u.points}** 💎\n\nاختر غرض عشان تشتريه بأزرار تحت:`)
    .addFields(items.map(it => ({ name: `${it.emoji} ${it.name} — ${it.price} 💎`, value: it.description })));

  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      items.slice(i, i + 5).map(it =>
        new ButtonBuilder().setCustomId(`shop:buy:${it.item_id}`).setLabel(`${it.name} (${it.price})`).setEmoji(it.emoji).setStyle(ButtonStyle.Secondary)
      )
    );
    rows.push(row);
  }
  return interaction.reply({ embeds: [embed], components: rows });
}

async function handleShopButton(interaction, action, itemId) {
  if (action !== 'buy') return;
  const result = db.buyItem(interaction.guildId, interaction.user.id, itemId);
  if (!result.ok) {
    if (result.reason === 'no_points') {
      return interaction.reply({ content: `❌ نقاطك ما تكفي! تحتاج **${result.item.price}** 💎 وعندك **${result.user.points}** 💎 فقط.`, ephemeral: true });
    }
    return interaction.reply({ content: '❌ الغرض غير موجود.', ephemeral: true });
  }
  return interaction.reply({
    content: `✅ اشتريت **${result.item.name}** ${result.item.emoji}! رصيدك الحالي: **${result.user.points}** 💎`,
    ephemeral: true,
  });
}

async function showInventory(interaction) {
  const inv = db.getInventory(interaction.guildId, interaction.user.id);
  if (inv.length === 0) return interaction.reply({ content: '📦 مخزونك فاضي، زور /متجر عشان تشتري أغراض!', ephemeral: true });
  const desc = inv.map(i => `${i.emoji} **${i.name}** ×${i.quantity} — ${i.description}`).join('\n\n');
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('📦 مخزونك').setDescription(desc)], ephemeral: true });
}

client.login(process.env.DISCORD_TOKEN);
