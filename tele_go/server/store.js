// Game Store — manages active games, players, and spectators
const { v4: uuidv4 } = require('uuid');
const { GoGame, BLACK, WHITE } = require('./game');

class GameStore {
  constructor() {
    this.games = new Map();       // gameId -> GameSession
    this.playerGames = new Map(); // oduserId -> Set<gameId>
  }

  createGame({ size = 19, komi = 6.5, creatorId, creatorName }) {
    const gameId = uuidv4().slice(0, 8);
    const session = {
      id: gameId,
      game: new GoGame(size, komi),
      players: {
        [BLACK]: { id: creatorId, name: creatorName || 'Black', connected: false },
        [WHITE]: null
      },
      spectators: new Map(), // oduserId -> { name, socketId }
      createdAt: Date.now(),
      settings: { size, komi },
      chatMessages: [],
      inviteCode: gameId,
      aiEnabled: false,
      aiDifficulty: 'medium'
    };

    this.games.set(gameId, session);
    this._trackPlayer(creatorId, gameId);

    return session;
  }

  joinGame(gameId, userId, userName) {
    const session = this.games.get(gameId);
    if (!session) return { error: 'Game not found' };

    // Already a player?
    if (session.players[BLACK] && session.players[BLACK].id === userId) {
      return { session, color: BLACK, role: 'player' };
    }
    if (session.players[WHITE] && session.players[WHITE].id === userId) {
      return { session, color: WHITE, role: 'player' };
    }

    // Join as white if slot open and game hasn't started
    if (!session.players[WHITE] && session.game.moves.length === 0) {
      session.players[WHITE] = { id: userId, name: userName || 'White', connected: false };
      this._trackPlayer(userId, gameId);
      return { session, color: WHITE, role: 'player' };
    }

    // Otherwise spectate
    session.spectators.set(userId, { name: userName || 'Spectator' });
    return { session, color: null, role: 'spectator' };
  }

  joinAsAI(gameId, difficulty = 'medium') {
    const session = this.games.get(gameId);
    if (!session) return { error: 'Game not found' };

    if (!session.players[WHITE]) {
      session.players[WHITE] = { id: 'ai', name: `AI (${difficulty})`, connected: true };
      session.aiEnabled = true;
      session.aiDifficulty = difficulty;
      return { session, color: WHITE };
    }

    return { error: 'Game is full' };
  }

  getGame(gameId) {
    return this.games.get(gameId);
  }

  getPlayerGames(userId) {
    const ids = this.playerGames.get(userId);
    if (!ids) return [];
    return [...ids].map(id => this.games.get(id)).filter(Boolean);
  }

  removeGame(gameId) {
    const session = this.games.get(gameId);
    if (session) {
      for (const color of [BLACK, WHITE]) {
        if (session.players[color]) {
          const pGames = this.playerGames.get(session.players[color].id);
          if (pGames) pGames.delete(gameId);
        }
      }
      this.games.delete(gameId);
    }
  }

  // Clean up old finished games (older than 24h)
  cleanup() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, session] of this.games) {
      if (session.game.gameOver && session.game.endTime < cutoff) {
        this.removeGame(id);
      }
    }
  }

  _trackPlayer(userId, gameId) {
    if (!this.playerGames.has(userId)) {
      this.playerGames.set(userId, new Set());
    }
    this.playerGames.get(userId).add(gameId);
  }

  getStats() {
    let active = 0, finished = 0, waiting = 0;
    for (const [, session] of this.games) {
      if (session.game.gameOver) finished++;
      else if (!session.players[WHITE]) waiting++;
      else active++;
    }
    return { total: this.games.size, active, finished, waiting };
  }
}

module.exports = { GameStore };
