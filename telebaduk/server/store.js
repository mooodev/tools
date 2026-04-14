const { GoGame, BLACK, WHITE } = require('./game');
const { v4: uuidv4 } = require('uuid');

class GameSession {
  constructor(id, settings, creatorId, creatorName, creatorChatId) {
    this.id = id;
    this.game = new GoGame(settings.size, settings.komi);
    this.settings = settings;
    this.players = {
      [BLACK]: { id: creatorId, name: creatorName || 'Black', connected: false },
      [WHITE]: null
    };
    this.spectators = new Map(); // socketId -> { id, name }
    this.isPublic = settings.isPublic !== false;
    this.creatorChatId = creatorChatId;
    this.playerChatIds = {}; // { odId -> chatId } for bot notifications
    if (creatorId && creatorChatId) {
      this.playerChatIds[creatorId] = creatorChatId;
    }
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.status = 'waiting'; // waiting, active, scoring, finished
    this.deadStones = []; // for end-game dead stone marking
  }

  isPlayer(userId) {
    return (this.players[BLACK] && this.players[BLACK].id === userId) ||
           (this.players[WHITE] && this.players[WHITE].id === userId);
  }

  getPlayerColor(userId) {
    if (this.players[BLACK] && this.players[BLACK].id === userId) return BLACK;
    if (this.players[WHITE] && this.players[WHITE].id === userId) return WHITE;
    return null;
  }

  setPlayerChatId(userId, chatId) {
    if (userId && chatId) this.playerChatIds[userId] = chatId;
  }

  getOpponentChatId(currentUserId) {
    const oppColor = this.getPlayerColor(currentUserId) === BLACK ? WHITE : BLACK;
    const opp = this.players[oppColor];
    return opp ? this.playerChatIds[opp.id] || null : null;
  }

  isOpponentConnected(currentUserId) {
    const oppColor = this.getPlayerColor(currentUserId) === BLACK ? WHITE : BLACK;
    const opp = this.players[oppColor];
    return opp ? opp.connected : false;
  }

  addSpectator(socketId, userId, userName) {
    this.spectators.set(socketId, { id: userId, name: userName || 'Spectator' });
  }

  removeSpectator(socketId) {
    this.spectators.delete(socketId);
  }

  toListItem() {
    return {
      id: this.id,
      size: this.settings.size,
      komi: this.settings.komi,
      status: this.status,
      players: {
        black: this.players[BLACK] ? this.players[BLACK].name : null,
        white: this.players[WHITE] ? this.players[WHITE].name : null
      },
      spectatorCount: this.spectators.size,
      moveCount: this.game.moves.length,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity
    };
  }
}

class GameStore {
  constructor() {
    this.games = new Map();
    this.playerGames = new Map(); // odId -> Set<gameId>

    // Cleanup old games every 30 min
    setInterval(() => this.cleanup(), 30 * 60 * 1000);
  }

  createGame(settings, creatorId, creatorName, creatorChatId) {
    const id = uuidv4().split('-')[0]; // short id
    const session = new GameSession(id, settings, creatorId, creatorName, creatorChatId);
    this.games.set(id, session);

    if (!this.playerGames.has(creatorId)) {
      this.playerGames.set(creatorId, new Set());
    }
    this.playerGames.get(creatorId).add(id);

    return session;
  }

  getGame(id) {
    return this.games.get(id) || null;
  }

  joinGame(gameId, userId, userName) {
    const session = this.games.get(gameId);
    if (!session) return { error: 'Game not found' };

    // Already a player
    if (session.isPlayer(userId)) {
      return { role: 'player', color: session.getPlayerColor(userId), session };
    }

    // Join as WHITE if slot available and game not started
    if (!session.players[WHITE] && session.status === 'waiting') {
      session.players[WHITE] = { id: userId, name: userName || 'White', connected: false };
      session.status = 'active';
      session.lastActivity = Date.now();

      if (!this.playerGames.has(userId)) {
        this.playerGames.set(userId, new Set());
      }
      this.playerGames.get(userId).add(gameId);

      return { role: 'player', color: WHITE, session, joined: true };
    }

    // Otherwise spectator
    return { role: 'spectator', session };
  }

  getPlayerGames(userId) {
    const gameIds = this.playerGames.get(userId);
    if (!gameIds) return [];
    const results = [];
    for (const id of gameIds) {
      const session = this.games.get(id);
      if (session) results.push(session.toListItem());
    }
    return results;
  }

  getPublicGames() {
    const results = [];
    for (const [, session] of this.games) {
      if (session.isPublic && session.status === 'active') {
        results.push(session.toListItem());
      }
    }
    return results.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  cleanup() {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48h
    for (const [id, session] of this.games) {
      if (session.status === 'finished' && session.lastActivity < cutoff) {
        // Clean up player references
        for (const color of [BLACK, WHITE]) {
          if (session.players[color]) {
            const pGames = this.playerGames.get(session.players[color].id);
            if (pGames) {
              pGames.delete(id);
              if (pGames.size === 0) this.playerGames.delete(session.players[color].id);
            }
          }
        }
        this.games.delete(id);
      }
    }
  }
}

module.exports = { GameStore, GameSession };
