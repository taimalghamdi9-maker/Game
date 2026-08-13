'use strict';
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('روليت')
    .setDescription('ابدأ لعبة روليت إقصاء جديدة في هذه القناة')
    .addIntegerOption(opt =>
      opt.setName('الحد_الاقصى')
        .setDescription('أقصى عدد لاعبين يقدرون ينضمون (افتراضي 20)')
        .setMinValue(2).setMaxValue(999))
    .addIntegerOption(opt =>
      opt.setName('الحد_الادنى')
        .setDescription('أقل عدد لاعبين للبدء (افتراضي 3)')
        .setMinValue(2).setMaxValue(999))
    .addIntegerOption(opt =>
      opt.setName('وقت_الانضمام')
        .setDescription('ثواني الانتظار قبل بدء اللعبة (افتراضي 60)')
        .setMinValue(15).setMaxValue(600)),

  new SlashCommandBuilder()
    .setName('نقاطي')
    .setDescription('اعرض رصيدك من النقاط')
    .addUserOption(opt => opt.setName('عضو').setDescription('اعرض نقاط عضو آخر')),

  new SlashCommandBuilder()
    .setName('المتصدرين')
    .setDescription('لوحة صدارة أصحاب أعلى نقاط بالسيرفر'),

  new SlashCommandBuilder()
    .setName('متجر')
    .setDescription('افتح متجر الخصائص لشراء أغراض بنقاطك'),

  new SlashCommandBuilder()
    .setName('مخزوني')
    .setDescription('اعرض الأغراض اللي معك بمخزونك'),
].map(c => c.toJSON());

module.exports = { commands };

// إذا تم تشغيل هذا الملف مباشرة (node deploy-commands.js) سجّل الأوامر يدوياً
if (require.main === module) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  (async () => {
    try {
      const clientId = process.env.CLIENT_ID;
      const guildId = process.env.GUILD_ID;

      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`✅ تم تسجيل ${commands.length} أوامر على السيرفر ${guildId} (تحديث فوري).`);
      } else {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`✅ تم تسجيل ${commands.length} أوامر عالمياً (قد تأخذ حتى ساعة للظهور).`);
      }
    } catch (err) {
      console.error('❌ فشل تسجيل الأوامر:', err);
    }
  })();
}
