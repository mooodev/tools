/**
 * server.js — Node.js backend: Express + Socket.io
 *
 * - Serves static files
 * - REST API for leaderboard
 * - WebSocket for duel matchmaking & gameplay
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'leaderboard.json');

// =============================================
// MIDDLEWARE
// =============================================
app.use(express.json());
app.use(express.static(__dirname));

// =============================================
// LEADERBOARD DATA STORE
// =============================================
function ensureDataDir() {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadLeaderboard() {
    try {
        ensureDataDir();
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading leaderboard:', e.message);
    }
    return { players: {} };
}

function saveLeaderboard(data) {
    try {
        ensureDataDir();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving leaderboard:', e.message);
    }
}

let leaderboardData = loadLeaderboard();

// =============================================
// LEADERBOARD API
// =============================================
app.post('/api/leaderboard', (req, res) => {
    const { id, name, xp, level, totalStars, bestStreak, currentStreak,
            dailyStreak, totalWins, totalGames, perfectGames, duelWins,
            categoriesFound, dailyPuzzlesTotal, weeklyPuzzlesTotal } = req.body;

    if (!id || !name) {
        return res.status(400).json({ error: 'id and name required' });
    }

    leaderboardData.players[id] = {
        id,
        name: String(name).slice(0, 20),
        xp: Number(xp) || 0,
        level: Number(level) || 1,
        totalStars: Number(totalStars) || 0,
        bestStreak: Number(bestStreak) || 0,
        currentStreak: Number(currentStreak) || 0,
        dailyStreak: Number(dailyStreak) || 0,
        totalWins: Number(totalWins) || 0,
        totalGames: Number(totalGames) || 0,
        perfectGames: Number(perfectGames) || 0,
        duelWins: Number(duelWins) || 0,
        categoriesFound: Number(categoriesFound) || 0,
        dailyPuzzlesTotal: Number(dailyPuzzlesTotal) || 0,
        weeklyPuzzlesTotal: Number(weeklyPuzzlesTotal) || 0,
        lastActive: new Date().toISOString()
    };

    saveLeaderboard(leaderboardData);
    res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
    const sort = req.query.sort || 'xp';
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const players = Object.values(leaderboardData.players);

    const sortFns = {
        xp:     (a, b) => (b.level * 10000 + b.xp) - (a.level * 10000 + a.xp),
        streak: (a, b) => b.bestStreak - a.bestStreak,
        stars:  (a, b) => b.totalStars - a.totalStars,
        wins:   (a, b) => b.totalWins - a.totalWins,
        duels:  (a, b) => b.duelWins - a.duelWins
    };

    players.sort(sortFns[sort] || sortFns.xp);
    res.json({ players: players.slice(0, limit), total: players.length });
});

app.get('/api/player/:id', (req, res) => {
    const player = leaderboardData.players[req.params.id];
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Calculate rank
    const allPlayers = Object.values(leaderboardData.players);
    allPlayers.sort((a, b) => (b.level * 10000 + b.xp) - (a.level * 10000 + a.xp));
    const rank = allPlayers.findIndex(p => p.id === req.params.id) + 1;

    res.json({ ...player, rank });
});

// =============================================
// DUEL MATCHMAKING
// =============================================
const duelQueue = [];        // Players waiting for a match
const activeduels = {};      // roomId → duel state
const BOT_WAIT_MS = 10000;   // 10 seconds before bot

const BOT_NAMES = [
    'Умник', 'Мастер слов', 'Знаток', 'Лингвист', 'Эрудит',
    'Словесник', 'Полиглот', 'Грамотей', 'Книгочей', 'Мудрец'
];

function generateRoomId() {
    return 'duel_' + crypto.randomBytes(6).toString('hex');
}

io.on('connection', (socket) => {
    let currentRoom = null;
    let botTimeout = null;

    socket.on('duel:find', (data) => {
        const playerInfo = {
            socketId: socket.id,
            socket,
            playerId: data.playerId,
            playerName: data.playerName || 'Игрок',
            playerLevel: data.playerLevel || 1,
            difficulty: data.difficulty || 'medium'
        };

        // Try to match with someone in queue with same difficulty
        const matchIdx = duelQueue.findIndex(q =>
            q.difficulty === playerInfo.difficulty && q.socketId !== socket.id
        );

        if (matchIdx >= 0) {
            // Match found!
            const opponent = duelQueue.splice(matchIdx, 1)[0];
            clearTimeout(opponent._botTimeout);

            const roomId = generateRoomId();
            const puzzleData = {
                difficulty: playerInfo.difficulty,
                puzzleIndex: data.puzzleIndex !== undefined
                    ? data.puzzleIndex
                    : Math.floor(Math.random() * 100)
            };

            const duelState = {
                roomId,
                puzzle: puzzleData,
                players: {
                    [socket.id]: {
                        ...playerInfo,
                        solved: 0,
                        finished: false,
                        won: false,
                        time: 0
                    },
                    [opponent.socketId]: {
                        ...opponent,
                        solved: 0,
                        finished: false,
                        won: false,
                        time: 0
                    }
                },
                startTime: Date.now(),
                isBot: false
            };

            activeduels[roomId] = duelState;

            // Join rooms
            socket.join(roomId);
            opponent.socket.join(roomId);
            currentRoom = roomId;

            // Notify both players
            socket.emit('duel:matched', {
                roomId,
                puzzle: puzzleData,
                opponent: {
                    name: opponent.playerName,
                    level: opponent.playerLevel,
                    isBot: false
                }
            });

            opponent.socket.emit('duel:matched', {
                roomId,
                puzzle: puzzleData,
                opponent: {
                    name: playerInfo.playerName,
                    level: playerInfo.playerLevel,
                    isBot: false
                }
            });
        } else {
            // No match — add to queue, start bot timer
            duelQueue.push(playerInfo);

            botTimeout = setTimeout(() => {
                // Remove from queue
                const idx = duelQueue.findIndex(q => q.socketId === socket.id);
                if (idx >= 0) duelQueue.splice(idx, 1);

                // Create bot match
                const roomId = generateRoomId();
                const puzzleData = {
                    difficulty: playerInfo.difficulty,
                    puzzleIndex: data.puzzleIndex !== undefined
                        ? data.puzzleIndex
                        : Math.floor(Math.random() * 100)
                };

                const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
                const botLevel = Math.max(1, playerInfo.playerLevel + Math.floor(Math.random() * 5) - 2);

                const duelState = {
                    roomId,
                    puzzle: puzzleData,
                    players: {
                        [socket.id]: {
                            ...playerInfo,
                            solved: 0,
                            finished: false,
                            won: false,
                            time: 0
                        },
                        bot: {
                            socketId: 'bot',
                            playerId: 'bot',
                            playerName: botName,
                            playerLevel: botLevel,
                            solved: 0,
                            finished: false,
                            won: false,
                            time: 0
                        }
                    },
                    startTime: Date.now(),
                    isBot: true,
                    botIntervals: []
                };

                activeduels[roomId] = duelState;
                socket.join(roomId);
                currentRoom = roomId;

                socket.emit('duel:matched', {
                    roomId,
                    puzzle: puzzleData,
                    opponent: {
                        name: botName,
                        level: botLevel,
                        isBot: true
                    }
                });

                // Start bot AI
                startBotAI(roomId, playerInfo.difficulty);
            }, BOT_WAIT_MS);

            playerInfo._botTimeout = botTimeout;

            socket.emit('duel:searching', { waitTime: BOT_WAIT_MS });
        }
    });

    socket.on('duel:progress', (data) => {
        const { roomId, solved } = data;
        const duel = activeduels[roomId];
        if (!duel || !duel.players[socket.id]) return;

        duel.players[socket.id].solved = solved;

        // Broadcast to opponent
        socket.to(roomId).emit('duel:opponent-progress', { solved });
    });

    socket.on('duel:finished', (data) => {
        const { roomId, won, time, stars } = data;
        const duel = activeduels[roomId];
        if (!duel || !duel.players[socket.id]) return;

        const player = duel.players[socket.id];
        player.finished = true;
        player.won = won;
        player.time = time;
        player.stars = stars || 0;

        // Check if both finished
        const allPlayers = Object.values(duel.players);
        const allFinished = allPlayers.every(p => p.finished);

        if (allFinished) {
            resolveDuel(roomId);
        } else {
            // Notify opponent that we finished
            socket.to(roomId).emit('duel:opponent-finished', {
                won, time, stars
            });
        }
    });

    socket.on('duel:cancel', () => {
        const idx = duelQueue.findIndex(q => q.socketId === socket.id);
        if (idx >= 0) {
            clearTimeout(duelQueue[idx]._botTimeout);
            duelQueue.splice(idx, 1);
        }
        clearTimeout(botTimeout);
    });

    socket.on('disconnect', () => {
        // Remove from queue
        const idx = duelQueue.findIndex(q => q.socketId === socket.id);
        if (idx >= 0) {
            clearTimeout(duelQueue[idx]._botTimeout);
            duelQueue.splice(idx, 1);
        }
        clearTimeout(botTimeout);

        // Handle active duel disconnect
        if (currentRoom && activeduels[currentRoom]) {
            const duel = activeduels[currentRoom];
            const player = duel.players[socket.id];
            if (player && !player.finished) {
                player.finished = true;
                player.won = false;
                player.time = 999;
                player.disconnected = true;

                // Notify opponent
                socket.to(currentRoom).emit('duel:opponent-disconnected');

                // Check if we should resolve
                const allFinished = Object.values(duel.players).every(p => p.finished);
                if (allFinished) {
                    resolveDuel(currentRoom);
                } else {
                    // Auto-resolve in 3 seconds
                    setTimeout(() => {
                        if (activeduels[currentRoom]) {
                            Object.values(duel.players).forEach(p => {
                                if (!p.finished) {
                                    p.finished = true;
                                    p.won = true;
                                    p.time = Math.floor((Date.now() - duel.startTime) / 1000);
                                }
                            });
                            resolveDuel(currentRoom);
                        }
                    }, 3000);
                }
            }
        }
    });
});

// =============================================
// BOT AI
// =============================================
function startBotAI(roomId, difficulty) {
    const duel = activeduels[roomId];
    if (!duel) return;

    // Bot solve intervals based on difficulty
    const intervals = {
        easy:   { min: 6000,  max: 12000 },
        medium: { min: 8000,  max: 18000 },
        hard:   { min: 12000, max: 25000 },
        expert: { min: 18000, max: 35000 }
    };

    const range = intervals[difficulty] || intervals.medium;
    let botSolved = 0;
    const maxCategories = 4;

    function botSolveNext() {
        if (!activeduels[roomId]) return;
        if (botSolved >= maxCategories) return;

        const duel = activeduels[roomId];
        const bot = duel.players.bot;
        if (!bot || bot.finished) return;

        // Random chance of mistake (delays the bot)
        const mistakeChance = { easy: 0.1, medium: 0.2, hard: 0.3, expert: 0.4 };
        const isMistake = Math.random() < (mistakeChance[difficulty] || 0.2);

        if (isMistake) {
            // Bot makes a "mistake" — just delays the next solve
            const delay = Math.random() * (range.max - range.min) * 0.5 + range.min * 0.3;
            const t = setTimeout(botSolveNext, delay);
            duel.botIntervals.push(t);
            return;
        }

        botSolved++;
        bot.solved = botSolved;

        // Broadcast bot progress
        io.to(roomId).emit('duel:opponent-progress', { solved: botSolved });

        if (botSolved >= maxCategories) {
            // Bot finished
            bot.finished = true;
            bot.won = true;
            bot.time = Math.floor((Date.now() - duel.startTime) / 1000);
            bot.stars = Math.random() > 0.5 ? 3 : 2;

            io.to(roomId).emit('duel:opponent-finished', {
                won: true,
                time: bot.time,
                stars: bot.stars
            });

            // Check if player also finished
            const allFinished = Object.values(duel.players).every(p => p.finished);
            if (allFinished) {
                resolveDuel(roomId);
            }
            return;
        }

        // Schedule next solve
        const delay = Math.random() * (range.max - range.min) + range.min;
        const t = setTimeout(botSolveNext, delay);
        duel.botIntervals.push(t);
    }

    // Start first solve after initial delay
    const firstDelay = Math.random() * (range.max - range.min) * 0.7 + range.min * 0.5;
    const t = setTimeout(botSolveNext, firstDelay);
    duel.botIntervals = [t];
}

function resolveDuel(roomId) {
    const duel = activeduels[roomId];
    if (!duel) return;

    // Clear bot intervals
    if (duel.botIntervals) {
        duel.botIntervals.forEach(t => clearTimeout(t));
    }

    const players = Object.entries(duel.players);
    let winner = null;
    let loser = null;

    // Determine winner: who won AND was faster
    const finishers = players
        .filter(([, p]) => p.won)
        .sort(([, a], [, b]) => a.time - b.time);

    if (finishers.length > 0) {
        winner = finishers[0];
        loser = players.find(([id]) => id !== winner[0]);
    } else {
        // Nobody won — it's a draw / both lost
        winner = players[0];
        loser = players[1];
    }

    const result = {
        winnerId: winner ? winner[1].playerId : null,
        winnerName: winner ? winner[1].playerName : null,
        winnerTime: winner ? winner[1].time : 0,
        winnerStars: winner ? winner[1].stars || 0 : 0,
        loserId: loser ? loser[1].playerId : null,
        loserName: loser ? loser[1].playerName : null,
        loserTime: loser ? loser[1].time : 0,
        loserStars: loser ? loser[1].stars || 0 : 0,
        isDraw: !finishers.length || (finishers.length === 2 && finishers[0][1].time === finishers[1][1].time),
        isBot: duel.isBot
    };

    io.to(roomId).emit('duel:result', result);

    // Cleanup after a delay
    setTimeout(() => {
        delete activeduels[roomId];
    }, 30000);
}

// =============================================
// TELEGRAM BOT (optional)
// =============================================
if (process.env.BOT_TOKEN) {
    try {
        require('./bot');
        console.log('Telegram bot started');
    } catch (e) {
        console.warn('Failed to start Telegram bot:', e.message);
        console.warn('Install node-telegram-bot-api: npm install node-telegram-bot-api');
    }
}

// =============================================
// START SERVER
// =============================================
server.listen(PORT, () => {
    console.log(`В тему! game server running on http://localhost:${PORT}`);
});
