// Tele Go — Main server
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { GameStore } = require('./store');
const { createBot } = require('./bot');
const { GoGame, BLACK, WHITE, opponent } = require('./game');
const { getAISuggestion, analyzeGame } = require('./ai');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || `http://localhost:${PORT}`;

// Initialize
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

const store = new GameStore();

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// API routes
app.get('/api/game/:id', (req, res) => {
  const session = store.getGame(req.params.id);
  if (!session) return res.status(404).json({ error: 'Game not found' });

  res.json({
    id: session.id,
    game: session.game.serialize(),
    players: {
      black: session.players[BLACK] ? { name: session.players[BLACK].name } : null,
      white: session.players[WHITE] ? { name: session.players[WHITE].name } : null
    },
    spectatorCount: session.spectators.size,
    settings: session.settings,
    aiEnabled: session.aiEnabled
  });
});

app.post('/api/game', (req, res) => {
  const { size = 19, komi = 6.5, userId, userName } = req.body;
  const session = store.createGame({
    size: parseInt(size),
    komi: parseFloat(komi),
    creatorId: userId || 'anonymous',
    creatorName: userName || 'Player'
  });
  res.json({ id: session.id, settings: session.settings });
});

// Socket.IO — real-time game communication
io.on('connection', (socket) => {
  let currentGame = null;
  let currentColor = null;
  let currentUserId = null;

  socket.on('join', ({ gameId, userId, userName }) => {
    currentUserId = userId || `anon_${socket.id.slice(0, 6)}`;
    const result = store.joinGame(gameId, currentUserId, userName);

    if (result.error) {
      socket.emit('error', { message: result.error });
      return;
    }

    currentGame = gameId;
    currentColor = result.color;
    socket.join(gameId);

    const session = result.session;
    if (result.color !== null && session.players[result.color]) {
      session.players[result.color].connected = true;
      session.players[result.color].socketId = socket.id;
    }

    // Send full game state to joiner
    socket.emit('gameState', {
      game: session.game.serialize(),
      color: result.color,
      role: result.role,
      players: {
        black: session.players[BLACK] ? { name: session.players[BLACK].name, connected: session.players[BLACK].connected } : null,
        white: session.players[WHITE] ? { name: session.players[WHITE].name, connected: session.players[WHITE].connected } : null
      },
      spectatorCount: session.spectators.size,
      settings: session.settings,
      aiEnabled: session.aiEnabled
    });

    // Notify others
    socket.to(gameId).emit('playerJoined', {
      role: result.role,
      color: result.color,
      name: userName,
      players: {
        black: session.players[BLACK] ? { name: session.players[BLACK].name, connected: session.players[BLACK].connected } : null,
        white: session.players[WHITE] ? { name: session.players[WHITE].name, connected: session.players[WHITE].connected } : null
      },
      spectatorCount: session.spectators.size
    });
  });

  socket.on('move', ({ x, y }) => {
    if (!currentGame || currentColor === null) return;

    const session = store.getGame(currentGame);
    if (!session) return;

    const game = session.game;
    if (game.currentPlayer !== currentColor) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const result = game.playMove(x, y, currentColor);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }

    // Broadcast move to all in game room
    io.to(currentGame).emit('movePlayed', {
      x, y,
      color: currentColor,
      captures: result.captured,
      moveNumber: result.move.moveNumber,
      currentPlayer: game.currentPlayer,
      captureCount: game.captures
    });

    // AI response if enabled
    if (session.aiEnabled && session.players[WHITE]?.id === 'ai' && game.currentPlayer === WHITE && !game.gameOver) {
      setTimeout(() => {
        const aiResult = getAISuggestion(game, session.aiDifficulty);
        if (aiResult.move && !aiResult.pass) {
          const aiMoveResult = game.playMove(aiResult.move.x, aiResult.move.y, WHITE);
          if (aiMoveResult.success) {
            io.to(currentGame).emit('movePlayed', {
              x: aiResult.move.x,
              y: aiResult.move.y,
              color: WHITE,
              captures: aiMoveResult.captured,
              moveNumber: aiMoveResult.move.moveNumber,
              currentPlayer: game.currentPlayer,
              captureCount: game.captures,
              isAI: true
            });
          }
        } else {
          game.pass(WHITE);
          io.to(currentGame).emit('passed', {
            color: WHITE,
            currentPlayer: game.currentPlayer,
            passCount: game.passCount,
            isAI: true
          });
          if (game.gameOver) {
            io.to(currentGame).emit('gameOver', {
              result: game.result,
              territory: game.territory ? game.territory.map(r => Array.from(r)) : null
            });
          }
        }
      }, 500 + Math.random() * 1000); // Slight delay for realism
    }
  });

  socket.on('pass', () => {
    if (!currentGame || currentColor === null) return;

    const session = store.getGame(currentGame);
    if (!session) return;

    const game = session.game;
    if (game.currentPlayer !== currentColor) return;

    game.pass(currentColor);

    io.to(currentGame).emit('passed', {
      color: currentColor,
      currentPlayer: game.currentPlayer,
      passCount: game.passCount
    });

    if (game.gameOver) {
      io.to(currentGame).emit('gameOver', {
        result: game.result,
        territory: game.territory ? game.territory.map(r => Array.from(r)) : null
      });
    }
  });

  socket.on('resign', () => {
    if (!currentGame || currentColor === null) return;

    const session = store.getGame(currentGame);
    if (!session) return;

    const result = session.game.resign(currentColor);
    io.to(currentGame).emit('gameOver', {
      result,
      resigned: currentColor
    });
  });

  socket.on('requestAISuggestion', () => {
    if (!currentGame || currentColor === null) return;

    const session = store.getGame(currentGame);
    if (!session || session.game.gameOver) return;
    if (session.game.currentPlayer !== currentColor) return;

    const suggestion = getAISuggestion(session.game, 'medium');
    socket.emit('aiSuggestion', {
      move: suggestion.move,
      confidence: suggestion.confidence,
      winRate: suggestion.winRate,
      topMoves: suggestion.topMoves
    });
  });

  socket.on('requestAnalysis', () => {
    if (!currentGame) return;

    const session = store.getGame(currentGame);
    if (!session || !session.game.gameOver) {
      socket.emit('error', { message: 'Game must be finished for analysis' });
      return;
    }

    const analysis = analyzeGame(session.game);
    socket.emit('analysisResult', analysis);
  });

  socket.on('enableAI', ({ difficulty }) => {
    if (!currentGame) return;

    const session = store.getGame(currentGame);
    if (!session) return;

    const result = store.joinAsAI(currentGame, difficulty || 'medium');
    if (!result.error) {
      io.to(currentGame).emit('aiJoined', {
        difficulty: session.aiDifficulty,
        players: {
          black: session.players[BLACK] ? { name: session.players[BLACK].name } : null,
          white: session.players[WHITE] ? { name: session.players[WHITE].name } : null
        }
      });
    }
  });

  socket.on('chat', ({ message }) => {
    if (!currentGame) return;
    const session = store.getGame(currentGame);
    if (!session) return;

    const name = currentColor !== null && session.players[currentColor]
      ? session.players[currentColor].name
      : 'Spectator';

    const chatMsg = { name, message, timestamp: Date.now(), color: currentColor };
    session.chatMessages.push(chatMsg);
    if (session.chatMessages.length > 100) session.chatMessages.shift();

    io.to(currentGame).emit('chat', chatMsg);
  });

  socket.on('disconnect', () => {
    if (currentGame) {
      const session = store.getGame(currentGame);
      if (session) {
        if (currentColor !== null && session.players[currentColor]) {
          session.players[currentColor].connected = false;
        }
        if (currentColor === null) {
          session.spectators.delete(currentUserId);
        }
        socket.to(currentGame).emit('playerDisconnected', {
          color: currentColor,
          spectatorCount: session.spectators.size
        });
      }
    }
  });
});

// Periodic cleanup
setInterval(() => store.cleanup(), 60 * 60 * 1000);

// Start server
server.listen(PORT, () => {
  console.log(`\n⚫⚪ Tele Go server running on port ${PORT}`);
  console.log(`   Web app: ${WEBAPP_URL}`);

  if (BOT_TOKEN) {
    const bot = createBot(BOT_TOKEN, WEBAPP_URL, store);
    console.log('   Telegram bot: starting...\n');
  } else {
    console.log('   ⚠️  No BOT_TOKEN — bot disabled, web app only\n');
  }
});
