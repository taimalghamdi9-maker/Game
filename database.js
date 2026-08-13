'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'roulette.db'));

// أداء وسلامة أعلى للبيانات (WAL = كتابة آمنة حتى لو تعطل البوت فجأة)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  games      INTEGER NOT NULL DEFAULT 0,
  kicks      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_items (
  item_id     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  price       INTEGER NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '✨'
);

CREATE TABLE IF NOT EXISTS inventory (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS game_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  winner_id  TEXT NOT NULL,
  players    INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);

// تعبئة متجر افتراضي إذا كان فارغ
const seedItems = [
  ['shield', 'درع الحماية', 'يحميك من أول محاولة طرد ضدك في الجولة القادمة', 50, '🛡️'],
  ['double', 'مضاعف النقاط', 'يضاعف النقاط اللي بتربحها بأول فوز قادم', 80, '💠'],
  ['reroll', 'إعادة تدوير', 'يعطيك فرصة ثانية بالعجلة إذا طلعت عليك', 60, '🔁'],
  ['immune', 'حصانة كاملة', 'تمنع طردك بالكامل لجولة واحدة (نادر واستهلاكه لمرة)', 150, '👑'],
  ['badge_vip', 'شارة VIP', 'شارة مميزة تظهر باسمك بالعجلة والنتائج', 200, '⭐'],
];
const insertItem = db.prepare(`INSERT OR IGNORE INTO shop_items (item_id, name, description, price, emoji) VALUES (?,?,?,?,?)`);
const seedTx = db.transaction((items) => { for (const it of items) insertItem.run(...it); });
seedTx(seedItems);

// ---------- عمليات المستخدمين ----------
const ensureUserStmt = db.prepare(`INSERT OR IGNORE INTO users (guild_id, user_id) VALUES (?, ?)`);
function ensureUser(guildId, userId) {
  ensureUserStmt.run(guildId, userId);
}

function getUser(guildId, userId) {
  ensureUser(guildId, userId);
  return db.prepare(`SELECT * FROM users WHERE guild_id=? AND user_id=?`).get(guildId, userId);
}

function addPoints(guildId, userId, amount) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET points = points + ?, updated_at = strftime('%s','now') WHERE guild_id=? AND user_id=?`)
    .run(amount, guildId, userId);
  return getUser(guildId, userId);
}

function spendPoints(guildId, userId, amount) {
  const u = getUser(guildId, userId);
  if (u.points < amount) return { ok: false, user: u };
  db.prepare(`UPDATE users SET points = points - ?, updated_at = strftime('%s','now') WHERE guild_id=? AND user_id=?`)
    .run(amount, guildId, userId);
  return { ok: true, user: getUser(guildId, userId) };
}

function recordWin(guildId, userId, playersCount) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET wins = wins + 1, games = games + 1 WHERE guild_id=? AND user_id=?`).run(guildId, userId);
  db.prepare(`INSERT INTO game_log (guild_id, winner_id, players) VALUES (?,?,?)`).run(guildId, userId, playersCount);
}

function recordGamePlayed(guildId, userId) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET games = games + 1 WHERE guild_id=? AND user_id=?`).run(guildId, userId);
}

function recordKick(guildId, userId) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET kicks = kicks + 1 WHERE guild_id=? AND user_id=?`).run(guildId, userId);
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare(`SELECT * FROM users WHERE guild_id=? ORDER BY points DESC, wins DESC LIMIT ?`).all(guildId, limit);
}

// ---------- المتجر والمخزون ----------
function getShopItems() {
  return db.prepare(`SELECT * FROM shop_items ORDER BY price ASC`).all();
}

function getItem(itemId) {
  return db.prepare(`SELECT * FROM shop_items WHERE item_id=?`).get(itemId);
}

function getInventory(guildId, userId) {
  return db.prepare(`SELECT inv.item_id, inv.quantity, s.name, s.description, s.emoji, s.price
                      FROM inventory inv JOIN shop_items s ON s.item_id = inv.item_id
                      WHERE inv.guild_id=? AND inv.user_id=? AND inv.quantity > 0`).all(guildId, userId);
}

function getItemQuantity(guildId, userId, itemId) {
  const row = db.prepare(`SELECT quantity FROM inventory WHERE guild_id=? AND user_id=? AND item_id=?`).get(guildId, userId, itemId);
  return row ? row.quantity : 0;
}

function addItem(guildId, userId, itemId, qty = 1) {
  db.prepare(`INSERT INTO inventory (guild_id, user_id, item_id, quantity) VALUES (?,?,?,?)
              ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity`)
    .run(guildId, userId, itemId, qty);
}

function useItem(guildId, userId, itemId) {
  const qty = getItemQuantity(guildId, userId, itemId);
  if (qty <= 0) return false;
  db.prepare(`UPDATE inventory SET quantity = quantity - 1 WHERE guild_id=? AND user_id=? AND item_id=?`)
    .run(guildId, userId, itemId);
  return true;
}

const buyItemTx = db.transaction((guildId, userId, itemId) => {
  const item = getItem(itemId);
  if (!item) return { ok: false, reason: 'not_found' };
  const spend = spendPoints(guildId, userId, item.price);
  if (!spend.ok) return { ok: false, reason: 'no_points', user: spend.user, item };
  addItem(guildId, userId, itemId, 1);
  return { ok: true, user: spend.user, item };
});

module.exports = {
  db,
  ensureUser, getUser, addPoints, spendPoints,
  recordWin, recordGamePlayed, recordKick,
  getLeaderboard,
  getShopItems, getItem, getInventory, getItemQuantity, addItem, useItem,
  buyItem: buyItemTx,
};
