require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameStore } = require('./store');
const { createBot } = require('./bot');
const { BLACK, WHITE } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const store = new GameStore();
let bot = null; // Telegram bot instance for notifications

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.get('/api/game/:id', (req, res) => {
  const session = store.getGame(req.params.id);
  if (!session) return res.status(404).json({ error: 'Game not found' });
  res.json({
    id: session.id,
    settings: session.settings,
    game: session.game.serialize(),
    players: {
      black: session.players[BLACK] ? { name: session.players[BLACK].name, connected: session.players[BLACK].connected } : null,
      white: session.players[WHITE] ? { name: session.players[WHITE].name, connected: session.players[WHITE].connected } : null
    },
    status: session.status,
    spectatorCount: session.spectators.size,
    isPublic: session.isPublic
  });
});

app.get('/api/games/player/:userId', (req, res) => {
  const games = store.getPlayerGames(req.params.userId);
  res.json(games);
});

app.get('/api/games/public', (req, res) => {
  const games = store.getPublicGames();
  res.json(games);
});

app.post('/api/game', (req, res) => {
  const { size = 19, komi = 6.5, isPublic = true, userId, userName, chatId } = req.body;
  const session = store.createGame({ size, komi, isPublic }, userId, userName, chatId);
  res.json({ id: session.id });
});

// Socket.IO
io.on('connection', (socket) => {
  let currentGameId = null;
  let currentUserId = null;
  let currentRole = null;

  socket.on('join', ({ gameId, userId, userName }) => {
    const result = store.joinGame(gameId, userId, userName);
    if (result.error) return socket.emit('error', { message: result.error });

    const session = result.session;
    currentGameId = gameId;
    currentUserId = userId;
    currentRole = result.role;

    socket.join(gameId);

    if (result.role === 'player') {
      const color = result.color;
      session.players[color].connected = true;
      session.players[color].socketId = socket.id;

      socket.emit('joined', {
        role: 'player',
        color,
        game: session.game.serialize(),
        settings: session.settings,
        players: {
          black: session.players[BLACK] ? { name: session.players[BLACK].name, connected: session.players[BLACK].connected } : null,
          white: session.players[WHITE] ? { name: session.players[WHITE].name, connected: session.players[WHITE].connected } : null
        },
        status: session.status,
        spectatorCount: session.spectators.size
      });

      if (result.joined) {
        io.to(gameId).emit('playerJoined', {
          color: WHITE,
          name: userName,
          status: session.status
        });
      }
    } else {
      session.addSpectator(socket.id, userId, userName);
      socket.emit('joined', {
        role: 'spectator',
        game: session.game.serialize(),
        settings: session.settings,
        players: {
          black: session.players[BLACK] ? { name: session.players[BLACK].name, connected: session.players[BLACK].connected } : null,
          white: session.players[WHITE] ? { name: session.players[WHITE].name, connected: session.players[WHITE].connected } : null
        },
        status: session.status,
        spectatorCount: session.spectators.size
      });

      io.to(gameId).emit('spectatorCount', session.spectators.size);
    }
  });

  socket.on('move', ({ x, y }) => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'active') return;

    const color = session.getPlayerColor(currentUserId);
    if (!color) return;

    const result = session.game.playMove(x, y, color);
    if (!result) return socket.emit('error', { message: 'Illegal move' });

    session.lastActivity = Date.now();

    // Get influence estimate
    const influence = session.game.estimateTerritory();

    io.to(currentGameId).emit('movePlayed', {
      x: result.x,
      y: result.y,
      color: result.color,
      captured: result.captured,
      moveNumber: result.moveNumber,
      currentPlayer: session.game.currentPlayer,
      captures: { ...session.game.captures },
      atariGroups: result.atariGroups.map(g => ({
        stones: g.stones,
        color: session.game.board[g.stones[0][1]][g.stones[0][0]] || color
      })),
      influence: {
        blackTerritory: influence.blackTerritory,
        whiteTerritory: influence.whiteTerritory
      }
    });

    // Notify opponent via bot if they're offline
    notifyOpponentTurn(session, currentUserId);
  });

  socket.on('pass', () => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'active') return;

    const color = session.getPlayerColor(currentUserId);
    if (!color) return;

    const result = session.game.pass(color);
    if (!result) return;

    session.lastActivity = Date.now();

    io.to(currentGameId).emit('passed', {
      color: result.color,
      moveNumber: result.moveNumber,
      currentPlayer: session.game.currentPlayer,
      consecutivePasses: session.game.consecutivePasses
    });

    // Notify opponent via bot if they're offline
    if (!session.game.gameOver) {
      notifyOpponentTurn(session, currentUserId);
    }

    if (session.game.gameOver) {
      session.status = 'scoring';
      io.to(currentGameId).emit('enterScoring', {
        result: session.game.result,
        territory: session.game.result.territory.map(r => Array.from(r))
      });
    }
  });

  socket.on('resign', () => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session) return;

    const color = session.getPlayerColor(currentUserId);
    if (!color) return;

    const result = session.game.resign(color);
    if (!result) return;

    session.status = 'finished';
    session.lastActivity = Date.now();

    io.to(currentGameId).emit('gameOver', result);
  });

  // Dead stone marking during scoring phase
  socket.on('toggleDead', ({ x, y }) => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'scoring') return;

    const idx = session.deadStones.findIndex(([dx, dy]) => dx === x && dy === y);
    if (idx >= 0) {
      // Also remove all stones in the same group
      const stone = session.game.board[y][x];
      if (stone) {
        const group = session.game.getGroup(x, y);
        for (const [gx, gy] of group.stones) {
          const gi = session.deadStones.findIndex(([dx, dy]) => dx === gx && dy === gy);
          if (gi >= 0) session.deadStones.splice(gi, 1);
        }
      } else {
        session.deadStones.splice(idx, 1);
      }
    } else {
      // Mark whole group as dead
      const stone = session.game.board[y][x];
      if (stone) {
        const group = session.game.getGroup(x, y);
        for (const [gx, gy] of group.stones) {
          if (!session.deadStones.find(([dx, dy]) => dx === gx && dy === gy)) {
            session.deadStones.push([gx, gy]);
          }
        }
      }
    }

    const score = session.game.finalScore(session.deadStones);
    io.to(currentGameId).emit('scoringUpdate', {
      deadStones: session.deadStones,
      score,
      territory: score.territory.map(r => Array.from(r))
    });
  });

  socket.on('confirmScore', () => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'scoring') return;

    const color = session.getPlayerColor(currentUserId);
    if (!session._scoreConfirmed) session._scoreConfirmed = new Set();
    session._scoreConfirmed.add(color);

    if (session._scoreConfirmed.size >= 2) {
      session.game.endGame(session.deadStones);
      session.status = 'finished';
      io.to(currentGameId).emit('gameOver', session.game.result);
    } else {
      io.to(currentGameId).emit('scoreConfirmedBy', { color });
    }
  });

  // Redo system
  socket.on('requestRedo', () => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'active') return;

    const color = session.getPlayerColor(currentUserId);
    if (!color) return;

    if (session.game.requestRedo(color)) {
      io.to(currentGameId).emit('redoRequested', { by: color });
    }
  });

  socket.on('acceptRedo', () => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'active') return;

    const color = session.getPlayerColor(currentUserId);
    if (!color) return;

    const undone = session.game.acceptRedo(color);
    if (undone) {
      io.to(currentGameId).emit('redoAccepted', {
        game: session.game.serialize()
      });
    }
  });

  socket.on('rejectRedo', () => {
    if (!currentGameId || currentRole !== 'player') return;
    const session = store.getGame(currentGameId);
    if (!session || session.status !== 'active') return;

    const color = session.getPlayerColor(currentUserId);
    if (!color) return;

    if (session.game.rejectRedo(color)) {
      io.to(currentGameId).emit('redoRejected', {});
    }
  });

  // Get influence on demand
  socket.on('getInfluence', () => {
    if (!currentGameId) return;
    const session = store.getGame(currentGameId);
    if (!session) return;

    const est = session.game.estimateTerritory();
    socket.emit('influenceUpdate', {
      blackTerritory: est.blackTerritory,
      whiteTerritory: est.whiteTerritory,
      influence: est.influence.map(r => Array.from(r)),
      territory: est.territory.map(r => Array.from(r))
    });
  });

  socket.on('disconnect', () => {
    if (!currentGameId) return;
    const session = store.getGame(currentGameId);
    if (!session) return;

    if (currentRole === 'player') {
      const color = session.getPlayerColor(currentUserId);
      if (color && session.players[color]) {
        session.players[color].connected = false;
        session.players[color].socketId = null;
      }
      io.to(currentGameId).emit('playerDisconnected', { color });
    } else {
      session.removeSpectator(socket.id);
      io.to(currentGameId).emit('spectatorCount', session.spectators.size);
    }
  });
});

// Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Telebaduk server on port ${PORT}`);
});

// Start bot if token provided
if (process.env.BOT_TOKEN) {
  bot = createBot(process.env.BOT_TOKEN, process.env.APP_URL || `http://localhost:${PORT}`, store);
}

// Notify offline opponent via bot that it's their turn
function notifyOpponentTurn(session, whoMovedUserId) {
  if (!bot) return;
  if (session.isOpponentConnected(whoMovedUserId)) return; // already in the app

  const oppChatId = session.getOpponentChatId(whoMovedUserId);
  if (!oppChatId) return;

  const moverColor = session.getPlayerColor(whoMovedUserId);
  const moverName = session.players[moverColor] ? session.players[moverColor].name : 'Your opponent';
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

  bot.sendMessage(oppChatId,
    `${moverName} played a move \u2014 it's your turn!`, {
    reply_markup: {
      inline_keyboard: [[{
        text: 'Play Now',
        web_app: { url: `${appUrl}?game=${session.id}` }
      }]]
    }
  }).catch(() => {}); // ignore errors silently
}
