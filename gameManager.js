'use strict';

/**
 * إدارة حالة كل لعبة روليت نشطة (لعبة واحدة لكل روم/قناة)
 * الحالة تُخزّن في الذاكرة أثناء تشغيل اللعبة (اللعبة نفسها جلسة حيّة)
 * أما النقاط والمخزون فتُحفظ بقاعدة بيانات دائمة (utils/database.js)
 */
class GameManager {
  constructor() {
    /** @type {Map<string, any>} channelId -> game state */
    this.games = new Map();
  }

  createLobby(channelId, { guildId, hostId, maxPlayers, minPlayers }) {
    const game = {
      channelId,
      guildId,
      hostId,
      status: 'lobby', // lobby -> running -> finished
      players: new Map(), // userId -> {id, name, avatarURL}
      eliminated: [],
      maxPlayers,
      minPlayers,
      messageId: null,
      round: 0,
      createdAt: Date.now(),
    };
    this.games.set(channelId, game);
    return game;
  }

  get(channelId) {
    return this.games.get(channelId);
  }

  end(channelId) {
    this.games.delete(channelId);
  }

  addPlayer(channelId, player) {
    const g = this.get(channelId);
    if (!g) return { ok: false, reason: 'no_game' };
    if (g.status !== 'lobby') return { ok: false, reason: 'already_started' };
    if (g.players.has(player.id)) return { ok: false, reason: 'already_joined' };
    if (g.players.size >= g.maxPlayers) return { ok: false, reason: 'full' };
    g.players.set(player.id, player);
    return { ok: true, game: g };
  }

  removePlayer(channelId, userId) {
    const g = this.get(channelId);
    if (!g) return { ok: false, reason: 'no_game' };
    g.players.delete(userId);
    return { ok: true, game: g };
  }
}

module.exports = new GameManager();
