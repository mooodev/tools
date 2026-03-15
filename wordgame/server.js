/**
 * server.js — Node.js backend: Express + Socket.io
 *
 * - Serves static files from public/ directory only
 * - REST API for leaderboard
 * - WebSocket for duel matchmaking & gameplay
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// CORS: restrict to allowed origins from env, default to same-origin (no wildcard)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : undefined;

const io = new Server(server, {
    cors: ALLOWED_ORIGINS
        ? { origin: ALLOWED_ORIGINS }
        : {} // same-origin only by default
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');
const BONUS_UNLOCKS_FILE = path.join(DATA_DIR, 'bonus_unlocks.json');
const WEEKLY_SPEED_FILE = path.join(DATA_DIR, 'weekly_speed.json');

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://telegram.org", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "https://raw.githubusercontent.com", "https://cdn.jsdelivr.net", "wss:", "ws:"],
            imgSrc: ["'self'", "data:", "https://raw.githubusercontent.com"],
        }
    }
}));
app.use(express.json({ limit: '10kb' }));

// Serve only the public/ directory — prevents source code exposure
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for POST API endpoints
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api', apiLimiter);

// =============================================
// ASYNC FILE I/O HELPERS
// =============================================
async function ensureDataDir() {
    await fsPromises.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Atomically write data to a JSON file (write to tmp, then rename).
 * Prevents corruption from crashes mid-write.
 */
async function atomicWriteJSON(filePath, data) {
    await ensureDataDir();
    const tmp = filePath + '.tmp';
    await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2));
    await fsPromises.rename(tmp, filePath);
}

async function readJSON(filePath, defaultValue) {
    try {
        await ensureDataDir();
        const content = await fsPromises.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`Error reading ${filePath}:`, e.message);
        }
        return defaultValue;
    }
}

// =============================================
// LEADERBOARD DATA STORE
// =============================================
// Load initial data synchronously at startup only
function ensureDataDirSync() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadLeaderboardSync() {
    try {
        ensureDataDirSync();
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading leaderboard:', e.message);
    }
    return { players: {} };
}

function loadWeeklySpeedSync() {
    try {
        ensureDataDirSync();
        if (fs.existsSync(WEEKLY_SPEED_FILE)) {
            return JSON.parse(fs.readFileSync(WEEKLY_SPEED_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading weekly speed:', e.message);
    }
    return { weeks: {} };
}

let leaderboardData = loadLeaderboardSync();
let weeklySpeedData = loadWeeklySpeedSync();

// =============================================
// LEADERBOARD API
// =============================================
app.post('/api/leaderboard', async (req, res) => {
    const { id, name, avatar, xp, level, totalStars, bestStreak, currentStreak,
            dailyStreak, totalWins, totalGames, perfectGames, duelWins,
            categoriesFound, dailyPuzzlesTotal, weeklyPuzzlesTotal } = req.body;

    if (!id || !name) {
        return res.status(400).json({ error: 'id and name required' });
    }

    leaderboardData.players[id] = {
        id,
        name: String(name).slice(0, 20),
        avatar: avatar ? String(avatar).slice(0, 20) : null,
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

    try {
        await atomicWriteJSON(DATA_FILE, leaderboardData);
    } catch (e) {
        console.error('Error saving leaderboard:', e.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
    res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
    const sort = req.query.sort || 'xp';
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const playerId = req.query.playerId || '';
    const players = Object.values(leaderboardData.players);

    const sortFns = {
        xp:     (a, b) => (b.level * 10000 + b.xp) - (a.level * 10000 + a.xp),
        streak: (a, b) => b.bestStreak - a.bestStreak,
        stars:  (a, b) => b.totalStars - a.totalStars,
        wins:   (a, b) => b.totalWins - a.totalWins,
        duels:  (a, b) => b.duelWins - a.duelWins
    };

    players.sort(sortFns[sort] || sortFns.xp);

    const result = { players: players.slice(0, limit), total: players.length };

    // If playerId is provided and not in top `limit`, include their rank & entry
    if (playerId) {
        const myIndex = players.findIndex(p => p.id === playerId);
        result.myRank = myIndex >= 0 ? myIndex + 1 : -1;
        if (myIndex >= limit) {
            result.myEntry = players[myIndex];
        }
    }

    res.json(result);
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
// WEEKLY SPEED LEADERBOARD
// =============================================
app.post('/api/weekly-speed', async (req, res) => {
    const { id, name, weekId, time } = req.body;

    if (!id || !weekId || time === undefined) {
        return res.status(400).json({ error: 'id, weekId, and time required' });
    }

    if (!weeklySpeedData.weeks[weekId]) {
        weeklySpeedData.weeks[weekId] = {};
    }

    // Only first completion counts — do not overwrite
    if (weeklySpeedData.weeks[weekId][id]) {
        const entries = Object.values(weeklySpeedData.weeks[weekId]);
        entries.sort((a, b) => a.time - b.time);
        const rank = entries.findIndex(e => e.id === id) + 1;
        return res.json({ ok: true, alreadySubmitted: true, rank, total: entries.length });
    }

    weeklySpeedData.weeks[weekId][id] = {
        id,
        name: String(name || 'Игрок').slice(0, 20),
        time: Number(time),
        submittedAt: new Date().toISOString()
    };

    try {
        await atomicWriteJSON(WEEKLY_SPEED_FILE, weeklySpeedData);
    } catch (e) {
        console.error('Error saving weekly speed:', e.message);
        return res.status(500).json({ error: 'Internal server error' });
    }

    const entries = Object.values(weeklySpeedData.weeks[weekId]);
    entries.sort((a, b) => a.time - b.time);
    const rank = entries.findIndex(e => e.id === id) + 1;

    res.json({ ok: true, rank, total: entries.length });
});

app.get('/api/weekly-speed', (req, res) => {
    const weekId = req.query.weekId;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const playerId = req.query.playerId || '';

    if (!weekId || !weeklySpeedData.weeks[weekId]) {
        return res.json({ players: [], total: 0, weekId });
    }

    const entries = Object.values(weeklySpeedData.weeks[weekId]);
    entries.sort((a, b) => a.time - b.time);

    const result = {
        players: entries.slice(0, limit),
        total: entries.length,
        weekId
    };

    if (playerId) {
        const myIndex = entries.findIndex(e => e.id === playerId);
        result.myRank = myIndex >= 0 ? myIndex + 1 : -1;
        if (myIndex >= limit) {
            result.myEntry = entries[myIndex];
        }
    }

    res.json(result);
});

app.get('/api/weekly-speed/previous/:id', (req, res) => {
    const playerId = req.params.id;

    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    // Strip time to avoid fractional-day drift (must match frontend getWeekId)
    const prevWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = prevWeek.getDay() || 7;
    prevWeek.setDate(prevWeek.getDate() + 4 - day);
    const year = prevWeek.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const weekNum = Math.ceil(((prevWeek - jan1) / 86400000 + 1) / 7);
    const prevWeekId = `${year}-W${String(weekNum).padStart(2, '0')}`;

    if (!weeklySpeedData.weeks[prevWeekId]) {
        return res.json({ found: false, weekId: prevWeekId });
    }

    const entries = Object.values(weeklySpeedData.weeks[prevWeekId]);
    entries.sort((a, b) => a.time - b.time);
    const idx = entries.findIndex(e => e.id === playerId);

    if (idx === -1) {
        return res.json({ found: false, weekId: prevWeekId, total: entries.length });
    }

    const entry = entries[idx];
    res.json({
        found: true,
        rank: idx + 1,
        total: entries.length,
        time: entry.time,
        weekId: prevWeekId
    });
});

// =============================================
// STATS API
// =============================================
app.get('/api/stats', (req, res) => {
    const players = Object.values(leaderboardData.players);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Group players by registration day (using lastActive as proxy)
    const playersByDate = {};
    let totalGames = 0;
    let totalWins = 0;
    let totalPerfect = 0;
    let totalDuels = 0;
    let totalDailyPuzzles = 0;
    let totalWeeklyPuzzles = 0;
    let totalStars = 0;
    let totalCategories = 0;

    // Level distribution
    const levelDistribution = {};

    // Activity tracking
    const activityByDate = {};

    players.forEach(p => {
        totalGames += p.totalGames || 0;
        totalWins += p.totalWins || 0;
        totalPerfect += p.perfectGames || 0;
        totalDuels += p.duelWins || 0;
        totalDailyPuzzles += p.dailyPuzzlesTotal || 0;
        totalWeeklyPuzzles += p.weeklyPuzzlesTotal || 0;
        totalStars += p.totalStars || 0;
        totalCategories += p.categoriesFound || 0;

        // Level distribution
        const lvl = p.level || 1;
        levelDistribution[lvl] = (levelDistribution[lvl] || 0) + 1;

        // Activity by date (from lastActive)
        if (p.lastActive) {
            const dateKey = p.lastActive.slice(0, 10); // YYYY-MM-DD
            if (!activityByDate[dateKey]) {
                activityByDate[dateKey] = { active: 0, new: 0 };
            }
            activityByDate[dateKey].active++;
        }
    });

    // Sort activity dates and compute cumulative new players
    // We treat a player's lastActive as their "first seen" approximation
    // For a better approach, we'd need a createdAt field
    const sortedDates = Object.keys(activityByDate).sort();

    // Players active in last periods
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    let activeToday = 0, activeLast7 = 0, activeLast30 = 0;
    players.forEach(p => {
        if (!p.lastActive) return;
        const la = new Date(p.lastActive);
        if (la >= todayStart) activeToday++;
        if (la >= sevenDaysAgo) activeLast7++;
        if (la >= thirtyDaysAgo) activeLast30++;
    });

    // Weekly speed stats (with participant names)
    const weeklySpeedStats = {};
    for (const [weekId, entries] of Object.entries(weeklySpeedData.weeks)) {
        const times = Object.values(entries);
        times.sort((a, b) => a.time - b.time);
        weeklySpeedStats[weekId] = {
            participants: times.length,
            avgTime: times.length > 0
                ? Math.round(times.reduce((s, e) => s + e.time, 0) / times.length)
                : 0,
            bestTime: times.length > 0
                ? Math.min(...times.map(e => e.time))
                : 0,
            playerList: times.map(e => ({ name: e.name, time: e.time }))
        };
    }

    // Full leaderboards for stats page
    const sortFns = {
        xp:    (a, b) => (b.level * 10000 + b.xp) - (a.level * 10000 + a.xp),
        duels: (a, b) => (b.duelWins || 0) - (a.duelWins || 0)
    };
    const leaderboards = {};
    for (const [key, fn] of Object.entries(sortFns)) {
        const sorted = [...players].sort(fn);
        leaderboards[key] = sorted.slice(0, 50).map((p, i) => ({
            rank: i + 1,
            name: p.name,
            avatar: p.avatar || null,
            level: p.level,
            xp: p.xp,
            totalWins: p.totalWins,
            totalGames: p.totalGames,
            duelWins: p.duelWins || 0
        }));
    }

    res.json({
        overview: {
            totalPlayers: players.length,
            activeToday,
            activeLast7Days: activeLast7,
            activeLast30Days: activeLast30,
            totalGames,
            totalWins,
            totalPerfectGames: totalPerfect,
            totalDuelWins: totalDuels,
            totalDailyPuzzles,
            totalWeeklyPuzzles,
            totalStars,
            totalCategories,
            avgGamesPerPlayer: players.length > 0
                ? Math.round(totalGames / players.length * 10) / 10
                : 0,
            avgWinRate: totalGames > 0
                ? Math.round(totalWins / totalGames * 1000) / 10
                : 0
        },
        levelDistribution,
        activityByDate,
        weeklySpeedStats,
        leaderboards
    });
});

// =============================================
// BONUS WORDS UNLOCK TRACKING
// =============================================
app.post('/api/bonus-unlock', async (req, res) => {
    const { userId, telegramId } = req.body;
    const id = telegramId || userId;
    if (!id) {
        return res.status(400).json({ error: 'userId or telegramId required' });
    }

    try {
        const data = await readJSON(BONUS_UNLOCKS_FILE, { users: {} });
        data.users[id] = {
            unlockedAt: new Date().toISOString(),
            telegramId: telegramId || null,
            userId: userId || null
        };
        await atomicWriteJSON(BONUS_UNLOCKS_FILE, data);
        res.json({ ok: true, unlocked: true });
    } catch (e) {
        console.error('Error saving bonus unlock:', e.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/bonus-unlock/:id', async (req, res) => {
    try {
        const data = await readJSON(BONUS_UNLOCKS_FILE, { users: {} });
        const unlocked = !!data.users[req.params.id];
        res.json({ unlocked });
    } catch (e) {
        console.error('Error reading bonus unlock:', e.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// COOLDOWN NOTIFICATIONS
// =============================================
const COOLDOWN_NOTIFY_FILE = path.join(DATA_DIR, 'cooldown_notify.json');

let cooldownNotifyData = {};
try {
    ensureDataDirSync();
    if (fs.existsSync(COOLDOWN_NOTIFY_FILE)) {
        cooldownNotifyData = JSON.parse(fs.readFileSync(COOLDOWN_NOTIFY_FILE, 'utf8'));
    }
} catch (e) { cooldownNotifyData = {}; }

const COOLDOWN_MESSAGES = [
    '🧩 Новые паззлы уже ждут тебя! Время поломать голову!',
    '🔓 Все таймеры сброшены! Покажи, на что способен!',
    '🧠 Готов к новым словесным головоломкам? Паззлы снова доступны!',
    '⚡ Перерыв окончен — паззлы разблокированы! Многие не справляются с этими уровнями... А ты?',
    '🎯 Паззлы снова открыты! Сможешь побить свой рекорд?',
    '🔥 Новые паззлы доступны! Только 30% игроков проходят всё без ошибок — попробуй!',
    '💡 Таймеры обнулились! Время показать свои навыки!',
    '🏆 Паззлы разблокированы! Каждый новый паззл — шанс заработать звёзды!',
];

app.post('/api/cooldown-notify', async (req, res) => {
    const { playerId, chatId, cooldowns } = req.body;
    if (!playerId || !chatId || !cooldowns) {
        return res.status(400).json({ error: 'playerId, chatId, and cooldowns required' });
    }

    // Find the latest cooldown expiry among all difficulties
    let maxExpiry = 0;
    for (const ts of Object.values(cooldowns)) {
        if (ts > maxExpiry) maxExpiry = ts;
    }

    if (maxExpiry <= Date.now()) {
        return res.json({ ok: true, scheduled: false });
    }

    cooldownNotifyData[playerId] = {
        chatId: Number(chatId),
        expiresAt: maxExpiry,
        notified: false
    };

    try {
        await atomicWriteJSON(COOLDOWN_NOTIFY_FILE, cooldownNotifyData);
    } catch (e) {
        console.error('Error saving cooldown notify:', e.message);
    }

    res.json({ ok: true, scheduled: true });
});

// Check cooldown notifications every 60 seconds
setInterval(async () => {
    const now = Date.now();
    let changed = false;

    for (const [playerId, entry] of Object.entries(cooldownNotifyData)) {
        // Clean up old notified entries (older than 25 hours)
        if (entry.notified && entry.expiresAt + 3600000 < now) {
            delete cooldownNotifyData[playerId];
            changed = true;
            continue;
        }

        if (entry.notified || entry.expiresAt > now) continue;

        // All cooldowns expired — send notification
        entry.notified = true;
        changed = true;

        // Only send if bot is available
        try {
            const botModule = require('./bot');
            if (botModule && botModule.bot) {
                const msg = COOLDOWN_MESSAGES[Math.floor(Math.random() * COOLDOWN_MESSAGES.length)];
                const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-domain.com';
                await botModule.bot.sendMessage(entry.chatId, msg, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🎮 Играть', web_app: { url: WEBAPP_URL } }]
                        ]
                    }
                });
                console.log(`Cooldown notification sent to ${entry.chatId}`);
            }
        } catch (e) {
            console.warn(`Failed to send cooldown notification to ${entry.chatId}:`, e.message);
        }
    }

    if (changed) {
        try {
            await atomicWriteJSON(COOLDOWN_NOTIFY_FILE, cooldownNotifyData);
        } catch (e) { /* ignore */ }
    }
}, 60 * 1000);

// =============================================
// LOAD PUZZLES FOR SERVER-SIDE DUEL RESOLUTION
// =============================================
// Parse words.js to get base puzzles (no bonus) so the server can send
// the actual puzzle data to both duel players, avoiding any client-side
// desync caused by different bonus unlock states or GitHub fetch results.
let SERVER_PUZZLES = [];
try {
    const wordsFile = fs.readFileSync(path.join(__dirname, 'public', 'words.js'), 'utf8');
    const match = wordsFile.match(/(?:const|let|var)\s+WORD_PUZZLES\s*=\s*/);
    if (match) {
        const dataStart = match.index + match[0].length;
        let depth = 0, inStr = false, strCh = '', esc = false, end = -1;
        for (let i = dataStart; i < wordsFile.length; i++) {
            const ch = wordsFile[i];
            if (esc) { esc = false; continue; }
            if (ch === '\\' && inStr) { esc = true; continue; }
            if (inStr) { if (ch === strCh) inStr = false; continue; }
            if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
            if (ch === '[' || ch === '{') depth++;
            if (ch === ']' || ch === '}') depth--;
            if (depth === 0) { end = i + 1; break; }
        }
        if (end > 0) {
            const raw = wordsFile.slice(dataStart, end)
                .replace(/\/\/.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
            SERVER_PUZZLES = JSON.parse(raw);
            console.log(`[server] Loaded ${SERVER_PUZZLES.length} base puzzles for duel resolution`);
        }
    }
} catch (e) {
    console.warn('[server] Failed to load puzzles for duel resolution:', e.message);
}

function getServerPuzzle(difficulty) {
    const pool = SERVER_PUZZLES.filter(p => p.difficulty === difficulty);
    if (pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return { puzzleIndex: idx, difficulty, categories: pool[idx].categories };
}

// =============================================
// DUEL MATCHMAKING
// =============================================
const duelQueue = [];        // Players waiting for a match (legacy)
const activeduels = {};      // roomId → duel state
const duelLobbies = {};      // roomId → lobby state (waiting rooms)
const BOT_WAIT_MS = 10000;   // 10 seconds before bot
const DUEL_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes max duel lifetime
const DUEL_ACCEPT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes for creator to accept after someone joins
const DUEL_INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes inactivity = auto-lose
const DUEL_FINISH_COUNTDOWN_MS = 5000; // 5 seconds for opponent to finish after first solver

const BOT_NAMES = [
    'Умник', 'Мастер слов', 'Знаток', 'Лингвист', 'Эрудит',
    'Словесник', 'Полиглот', 'Грамотей', 'Книгочей', 'Мудрец'
];

function generateRoomId() {
    return 'duel_' + crypto.randomBytes(6).toString('hex');
}

// Periodic cleanup of abandoned/stale duels and lobbies
const duelCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [roomId, duel] of Object.entries(activeduels)) {
        if (now - duel.startTime > DUEL_MAX_AGE_MS) {
            if (duel.botIntervals) {
                duel.botIntervals.forEach(t => clearTimeout(t));
            }
            if (duel.finishCountdownTimer) {
                clearTimeout(duel.finishCountdownTimer);
            }
            delete activeduels[roomId];
            console.log(`Cleaned up stale duel: ${roomId}`);
        }
    }
    // Cleanup stale lobbies (open for too long without anyone joining)
    for (const [roomId, lobby] of Object.entries(duelLobbies)) {
        if (!lobby.pendingJoin && now - lobby.createdAt > DUEL_MAX_AGE_MS) {
            delete duelLobbies[roomId];
            io.emit('duel:lobbies-updated', getPublicLobbies());
            console.log(`Cleaned up stale lobby: ${roomId}`);
        }
    }
    // Cleanup pending duels (where someone joined but creator hasn't appeared)
    for (const [roomId, lobby] of Object.entries(duelLobbies)) {
        if (lobby.pendingJoin && now - lobby.pendingJoinAt > DUEL_ACCEPT_TIMEOUT_MS) {
            // Creator didn't show up — joiner wins
            if (lobby.joinerSocket && lobby.joinerSocket.connected) {
                lobby.joinerSocket.emit('duel:acceptance-timeout', {
                    roomId,
                    creatorName: lobby.creatorName,
                    youWin: true
                });
            }
            delete duelLobbies[roomId];
            io.emit('duel:lobbies-updated', getPublicLobbies());
            console.log(`Lobby ${roomId}: creator didn't appear, joiner wins`);
        }
    }
    // Cleanup inactivity in active duels
    for (const [roomId, duel] of Object.entries(activeduels)) {
        if (duel.isBot) continue;
        for (const [sid, player] of Object.entries(duel.players)) {
            if (!player.finished && player.lastActivity && now - player.lastActivity > DUEL_INACTIVITY_MS) {
                player.finished = true;
                player.won = false;
                player.time = 999;
                player.inactive = true;
                if (player.socket && player.socket.connected) {
                    player.socket.emit('duel:inactivity-lose', { roomId });
                }
                // Notify opponent
                const oppEntry = Object.entries(duel.players).find(([id]) => id !== sid);
                if (oppEntry && oppEntry[1].socket && oppEntry[1].socket.connected) {
                    oppEntry[1].socket.emit('duel:opponent-inactive');
                }
                const allFinished = Object.values(duel.players).every(p => p.finished);
                if (allFinished) {
                    resolveDuel(roomId);
                } else {
                    // Give remaining player a few seconds
                    setTimeout(() => {
                        if (activeduels[roomId]) {
                            Object.values(duel.players).forEach(p => {
                                if (!p.finished) {
                                    p.finished = true;
                                    p.won = true;
                                    p.time = Math.floor((Date.now() - duel.startTime) / 1000);
                                }
                            });
                            resolveDuel(roomId);
                        }
                    }, 3000);
                }
            }
        }
    }
}, 10 * 1000); // Check every 10 seconds

// Helper: get public lobby list (exclude lobbies with pending joins)
function getPublicLobbies() {
    return Object.values(duelLobbies)
        .filter(l => !l.pendingJoin)
        .map(l => ({
            roomId: l.roomId,
            creatorId: l.creatorId,
            creatorName: l.creatorName,
            creatorLevel: l.creatorLevel,
            isBet: l.isBet,
            betAmount: l.betAmount,
            createdAt: l.createdAt,
            difficulty: l.difficulty
        }));
}

// Helper: close all open lobbies for a player (when they start a new duel)
function closePlayerLobbies(playerId, excludeRoomId) {
    for (const [roomId, lobby] of Object.entries(duelLobbies)) {
        if (roomId === excludeRoomId) continue;
        if (lobby.creatorId === playerId) {
            // Notify joiner if someone was waiting
            if (lobby.pendingJoin && lobby.joinerSocket && lobby.joinerSocket.connected) {
                lobby.joinerSocket.emit('duel:lobby-cancelled', { roomId, creatorName: lobby.creatorName });
            }
            delete duelLobbies[roomId];
        }
    }
    io.emit('duel:lobbies-updated', getPublicLobbies());
}

// Helper: check if player is in any active duel
function isPlayerInActiveDuel(playerId) {
    return Object.values(activeduels).some(d =>
        Object.values(d.players).some(p => p.playerId === playerId && !p.finished)
    );
}

io.on('connection', (socket) => {
    socket._duelRoom = null; // Track current duel room on socket
    let currentRoom = null;
    let botTimeout = null;

    // ---- DUEL LOBBY EVENTS ----
    socket.on('duel:create-lobby', (data) => {
        // Check if player is already in an active duel
        if (isPlayerInActiveDuel(data.playerId)) {
            socket.emit('duel:lobby-error', { error: 'Вы уже участвуете в дуэли' });
            return;
        }

        // Close any existing open lobbies for this player
        closePlayerLobbies(data.playerId);

        // Validate inputs
        const VALID_BET_AMOUNTS = [10, 25, 50, 100];
        const betAmount = data.isBet ? (Number(data.betAmount) || 10) : 0;
        if (data.isBet && !VALID_BET_AMOUNTS.includes(betAmount)) {
            socket.emit('duel:lobby-error', { error: 'Недопустимая ставка' });
            return;
        }

        const roomId = generateRoomId();
        const lobby = {
            roomId,
            creatorSocket: socket,
            creatorId: data.playerId,
            creatorName: String(data.playerName || 'Игрок').slice(0, 20),
            creatorLevel: Math.max(1, Math.min(999, Number(data.playerLevel) || 1)),
            creatorChatId: data.chatId || null,
            difficulty: data.difficulty || 'hard',
            isBet: !!data.isBet,
            betAmount,
            createdAt: Date.now(),
            pendingJoin: false
        };
        duelLobbies[roomId] = lobby;
        socket.emit('duel:lobby-created', { roomId, lobby: getPublicLobbies().find(l => l.roomId === roomId) });
        io.emit('duel:lobbies-updated', getPublicLobbies());
    });

    socket.on('duel:cancel-lobby', (data) => {
        const { roomId, playerId } = data || {};
        if (roomId && duelLobbies[roomId]) {
            const lobby = duelLobbies[roomId];
            // Only creator can cancel, or match by playerId
            if (lobby.creatorSocket === socket || lobby.creatorId === playerId) {
                // If someone was waiting, notify them
                if (lobby.pendingJoin && lobby.joinerSocket && lobby.joinerSocket.connected) {
                    lobby.joinerSocket.emit('duel:lobby-cancelled', { roomId, creatorName: lobby.creatorName });
                }
                delete duelLobbies[roomId];
                io.emit('duel:lobbies-updated', getPublicLobbies());
            }
        }
    });

    socket.on('duel:get-lobbies', () => {
        socket.emit('duel:lobbies-updated', getPublicLobbies());
    });

    socket.on('duel:join-lobby', (data) => {
        const { roomId, playerId, playerName, playerLevel } = data;
        const lobby = duelLobbies[roomId];
        if (!lobby) {
            socket.emit('duel:lobby-error', { error: 'Комната не найдена или истекла' });
            return;
        }
        if (lobby.creatorId === playerId) {
            socket.emit('duel:lobby-error', { error: 'Нельзя присоединиться к своей комнате' });
            return;
        }
        if (lobby.pendingJoin) {
            socket.emit('duel:lobby-error', { error: 'Кто-то уже присоединяется к этой дуэли' });
            return;
        }

        // Check if joiner is already in an active duel
        if (isPlayerInActiveDuel(playerId)) {
            socket.emit('duel:lobby-error', { error: 'Вы уже участвуете в дуэли' });
            return;
        }

        // Close any existing lobbies the joiner has
        closePlayerLobbies(playerId);

        // Store joiner info on the lobby
        lobby.pendingJoin = true;
        lobby.pendingJoinAt = Date.now();
        lobby.joinerSocket = socket;
        lobby.joinerId = playerId;
        lobby.joinerName = playerName || 'Игрок';
        lobby.joinerLevel = playerLevel || 1;

        // Remove from public lobby list (it's now pending)
        io.emit('duel:lobbies-updated', getPublicLobbies());

        // Check if creator is currently online (socket connected)
        const creatorOnline = lobby.creatorSocket && lobby.creatorSocket.connected;

        if (creatorOnline) {
            // Creator is online — notify them directly via socket
            lobby.creatorSocket.emit('duel:challenge-received', {
                roomId,
                challengerName: playerName || 'Игрок',
                challengerLevel: playerLevel || 1,
                isBet: lobby.isBet,
                betAmount: lobby.betAmount
            });

            // Also start the game immediately since both are online
            startDuelFromLobby(lobby, socket, playerId, playerName, playerLevel);
            return;
        }

        // Creator is offline — show waiting screen to joiner
        socket.emit('duel:waiting-for-creator', {
            roomId,
            creatorName: lobby.creatorName,
            timeout: DUEL_ACCEPT_TIMEOUT_MS
        });

        // Send Telegram notification to creator
        if (lobby.creatorChatId) {
            sendDuelChallengeNotification(
                lobby.creatorChatId,
                playerName || 'Игрок',
                playerLevel || 1,
                lobby.isBet,
                lobby.betAmount,
                roomId
            );
        }
    });

    // Creator accepts the challenge (comes back online or clicks notification)
    socket.on('duel:accept-challenge', (data) => {
        const { roomId } = data;
        const lobby = duelLobbies[roomId];
        if (!lobby || !lobby.pendingJoin) {
            socket.emit('duel:lobby-error', { error: 'Дуэль не найдена' });
            return;
        }

        // Update creator socket (may have reconnected)
        lobby.creatorSocket = socket;

        if (!lobby.joinerSocket || !lobby.joinerSocket.connected) {
            // Joiner disconnected — creator wins by default
            socket.emit('duel:acceptance-timeout', {
                roomId,
                creatorName: lobby.joinerName,
                youWin: true
            });
            delete duelLobbies[roomId];
            io.emit('duel:lobbies-updated', getPublicLobbies());
            return;
        }

        startDuelFromLobby(lobby, lobby.joinerSocket, lobby.joinerId, lobby.joinerName, lobby.joinerLevel);
    });

    // Check if player has a pending duel when they connect/reconnect
    socket.on('duel:check-pending', (data) => {
        const { playerId } = data;
        // Check if this player created a lobby that has a pending joiner
        const lobby = Object.values(duelLobbies).find(
            l => l.creatorId === playerId && l.pendingJoin
        );
        if (lobby) {
            // Update creator socket reference
            lobby.creatorSocket = socket;
            socket.emit('duel:challenge-received', {
                roomId: lobby.roomId,
                challengerName: lobby.joinerName,
                challengerLevel: lobby.joinerLevel,
                isBet: lobby.isBet,
                betAmount: lobby.betAmount
            });
        }

        // Also check if player has an existing lobby (for UI state)
        const myLobby = Object.values(duelLobbies).find(l => l.creatorId === playerId && !l.pendingJoin);
        if (myLobby) {
            socket.emit('duel:lobby-created', {
                roomId: myLobby.roomId,
                lobby: getPublicLobbies().find(l => l.roomId === myLobby.roomId)
            });
        }
    });

    socket.on('duel:find', (data) => {
        // Check if player is already in an active duel
        if (isPlayerInActiveDuel(data.playerId)) {
            socket.emit('duel:lobby-error', { error: 'Вы уже участвуете в дуэли' });
            return;
        }

        // Close any existing lobbies
        closePlayerLobbies(data.playerId);

        const playerInfo = {
            socketId: socket.id,
            socket,
            playerId: data.playerId,
            playerName: data.playerName || 'Игрок',
            playerLevel: data.playerLevel || 1,
            difficulty: data.difficulty || 'hard'
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
            const puzzleData = getServerPuzzle(playerInfo.difficulty) || {
                difficulty: playerInfo.difficulty,
                puzzleIndex: Math.floor(Math.random() * 100)
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
                isBot: false,
                botIntervals: []
            };

            activeduels[roomId] = duelState;

            // Join rooms
            socket.join(roomId);
            opponent.socket.join(roomId);
            currentRoom = roomId;
            socket._duelRoom = roomId;
            opponent.socket._duelRoom = roomId;

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
                const puzzleData = getServerPuzzle(playerInfo.difficulty) || {
                    difficulty: playerInfo.difficulty,
                    puzzleIndex: Math.floor(Math.random() * 100)
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
                socket._duelRoom = roomId;

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
        duel.players[socket.id].lastActivity = Date.now();

        // Broadcast to opponent
        socket.to(roomId).emit('duel:opponent-progress', { solved });
    });

    // Track activity (any move resets inactivity timer)
    socket.on('duel:activity', (data) => {
        const { roomId } = data;
        const duel = activeduels[roomId];
        if (!duel || !duel.players[socket.id]) return;
        duel.players[socket.id].lastActivity = Date.now();
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
        player.lastActivity = Date.now();

        // Check if both finished
        const allPlayers = Object.values(duel.players);
        const allFinished = allPlayers.every(p => p.finished);

        if (allFinished) {
            // Clear any pending countdown timer
            if (duel.finishCountdownTimer) {
                clearTimeout(duel.finishCountdownTimer);
                duel.finishCountdownTimer = null;
            }
            resolveDuel(roomId);
        } else if (won) {
            // Player solved the puzzle — start 5-second countdown for opponent
            // Notify opponent with countdown
            socket.to(roomId).emit('duel:opponent-finished', {
                won, time, stars, countdown: DUEL_FINISH_COUNTDOWN_MS / 1000
            });

            // After 5 seconds, if opponent hasn't finished, they lose
            duel.finishCountdownTimer = setTimeout(() => {
                if (!activeduels[roomId]) return;
                const duelNow = activeduels[roomId];
                Object.values(duelNow.players).forEach(p => {
                    if (!p.finished) {
                        p.finished = true;
                        p.won = false;
                        p.time = 999;
                        p.timedOut = true;
                    }
                });
                resolveDuel(roomId);
            }, DUEL_FINISH_COUNTDOWN_MS);
        } else {
            // Player lost (ran out of attempts) — just notify opponent
            socket.to(roomId).emit('duel:opponent-finished', {
                won, time, stars
            });
        }
    });

    // Player explicitly leaves a duel (back button, menu navigation, app close)
    socket.on('duel:leave', (data) => {
        const { roomId } = data || {};
        const duelRoom = roomId || currentRoom || socket._duelRoom;
        if (!duelRoom || !activeduels[duelRoom]) return;

        const duel = activeduels[duelRoom];
        const player = duel.players[socket.id];
        if (!player || player.finished) return;

        // Mark player as lost (left the game)
        player.finished = true;
        player.won = false;
        player.time = 999;
        player.left = true;

        // Notify opponent
        socket.to(duelRoom).emit('duel:opponent-disconnected');

        // Clear any pending countdown
        if (duel.finishCountdownTimer) {
            clearTimeout(duel.finishCountdownTimer);
            duel.finishCountdownTimer = null;
        }

        // Check if both finished
        const allFinished = Object.values(duel.players).every(p => p.finished);
        if (allFinished) {
            resolveDuel(duelRoom);
        } else {
            // Auto-win for remaining player after 3 seconds
            setTimeout(() => {
                if (!activeduels[duelRoom]) return;
                Object.values(duel.players).forEach(p => {
                    if (!p.finished) {
                        p.finished = true;
                        p.won = true;
                        p.time = Math.floor((Date.now() - duel.startTime) / 1000);
                    }
                });
                resolveDuel(duelRoom);
            }, 3000);
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

        // Don't delete lobbies on disconnect — creator can navigate away and come back
        // Only mark the socket as disconnected so we know to send Telegram notification if someone joins
        for (const [roomId, lobby] of Object.entries(duelLobbies)) {
            if (lobby.creatorSocket === socket) {
                lobby.creatorSocket = null; // Mark as offline
            }
            // If joiner disconnects from a pending lobby, creator wins
            if (lobby.pendingJoin && lobby.joinerSocket === socket) {
                lobby.pendingJoin = false;
                lobby.joinerSocket = null;
                if (lobby.creatorSocket && lobby.creatorSocket.connected) {
                    lobby.creatorSocket.emit('duel:joiner-left', { roomId });
                }
                io.emit('duel:lobbies-updated', getPublicLobbies());
            }
        }

        // Handle active duel disconnect
        const duelRoom = currentRoom || socket._duelRoom;
        if (duelRoom && activeduels[duelRoom]) {
            const duel = activeduels[duelRoom];
            const player = duel.players[socket.id];
            if (player && !player.finished) {
                player.finished = true;
                player.won = false;
                player.time = 999;
                player.disconnected = true;

                // Notify opponent
                socket.to(duelRoom).emit('duel:opponent-disconnected');

                // Clear any pending countdown timer
                if (duel.finishCountdownTimer) {
                    clearTimeout(duel.finishCountdownTimer);
                    duel.finishCountdownTimer = null;
                }

                // Check if we should resolve
                const allFinished = Object.values(duel.players).every(p => p.finished);
                if (allFinished) {
                    resolveDuel(duelRoom);
                } else {
                    // Auto-resolve in 3 seconds — opponent wins
                    const roomToResolve = duelRoom;
                    setTimeout(() => {
                        if (activeduels[roomToResolve]) {
                            Object.values(duel.players).forEach(p => {
                                if (!p.finished) {
                                    p.finished = true;
                                    p.won = true;
                                    p.time = Math.floor((Date.now() - duel.startTime) / 1000);
                                }
                            });
                            resolveDuel(roomToResolve);
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
        hard:   { min: 10000, max: 22000 },
        expert: { min: 18000, max: 35000 }
    };

    const range = intervals[difficulty] || intervals.hard;
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
                stars: bot.stars,
                countdown: DUEL_FINISH_COUNTDOWN_MS / 1000
            });

            // Check if player also finished
            const allFinished = Object.values(duel.players).every(p => p.finished);
            if (allFinished) {
                resolveDuel(roomId);
            } else {
                // Start 5-second countdown for human player
                duel.finishCountdownTimer = setTimeout(() => {
                    if (!activeduels[roomId]) return;
                    Object.values(duel.players).forEach(p => {
                        if (!p.finished) {
                            p.finished = true;
                            p.won = false;
                            p.time = 999;
                            p.timedOut = true;
                        }
                    });
                    resolveDuel(roomId);
                }, DUEL_FINISH_COUNTDOWN_MS);
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

// =============================================
// START DUEL FROM LOBBY (shared helper)
// =============================================
function startDuelFromLobby(lobby, joinerSocket, joinerId, joinerName, joinerLevel) {
    const roomId = lobby.roomId;

    // Remove lobby
    delete duelLobbies[roomId];
    io.emit('duel:lobbies-updated', getPublicLobbies());

    // Create actual duel — resolve puzzle server-side to guarantee sync
    const puzzleData = getServerPuzzle(lobby.difficulty) || {
        difficulty: lobby.difficulty,
        puzzleIndex: Math.floor(Math.random() * 100)
    };

    const now = Date.now();
    const duelState = {
        roomId,
        puzzle: puzzleData,
        players: {
            [lobby.creatorSocket.id]: {
                socketId: lobby.creatorSocket.id,
                socket: lobby.creatorSocket,
                playerId: lobby.creatorId,
                playerName: lobby.creatorName,
                playerLevel: lobby.creatorLevel,
                difficulty: lobby.difficulty,
                solved: 0,
                finished: false,
                won: false,
                time: 0,
                lastActivity: now
            },
            [joinerSocket.id]: {
                socketId: joinerSocket.id,
                socket: joinerSocket,
                playerId: joinerId,
                playerName: joinerName || 'Игрок',
                playerLevel: joinerLevel || 1,
                difficulty: lobby.difficulty,
                solved: 0,
                finished: false,
                won: false,
                time: 0,
                lastActivity: now
            }
        },
        startTime: now,
        isBot: false,
        botIntervals: [],
        isBet: lobby.isBet,
        betAmount: lobby.betAmount
    };

    activeduels[roomId] = duelState;
    lobby.creatorSocket.join(roomId);
    joinerSocket.join(roomId);
    lobby.creatorSocket._duelRoom = roomId;
    joinerSocket._duelRoom = roomId;

    // Notify both players
    lobby.creatorSocket.emit('duel:matched', {
        roomId,
        puzzle: puzzleData,
        isBet: lobby.isBet,
        betAmount: lobby.betAmount,
        opponent: {
            name: joinerName || 'Игрок',
            level: joinerLevel || 1,
            isBot: false
        }
    });

    joinerSocket.emit('duel:matched', {
        roomId,
        puzzle: puzzleData,
        isBet: lobby.isBet,
        betAmount: lobby.betAmount,
        opponent: {
            name: lobby.creatorName,
            level: lobby.creatorLevel,
            isBot: false
        }
    });
}

// =============================================
// TELEGRAM DUEL NOTIFICATION
// =============================================
function sendDuelChallengeNotification(chatId, challengerName, challengerLevel, isBet, betAmount, roomId) {
    try {
        const botModule = require('./bot');
        if (botModule && botModule.bot) {
            const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-domain.com';
            const betText = isBet ? `\n💰 Ставка: ${betAmount} монет` : '';
            const msg = `⚔️ *${challengerName}* (Ур. ${challengerLevel}) вызывает вас на дуэль!${betText}\n\nУ вас 2 минуты чтобы принять вызов, иначе вы проиграете!`;

            botModule.bot.sendMessage(chatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⚔️ Сражаться!', web_app: { url: `${WEBAPP_URL}?duel_room=${roomId}` } }]
                    ]
                }
            });
            console.log(`Duel challenge notification sent to ${chatId}`);
        }
    } catch (e) {
        console.warn(`Failed to send duel notification to ${chatId}:`, e.message);
    }
}

function resolveDuel(roomId) {
    const duel = activeduels[roomId];
    if (!duel) return;

    // Prevent double resolution
    if (duel.resolved) return;
    duel.resolved = true;

    // Clear bot intervals
    if (duel.botIntervals) {
        duel.botIntervals.forEach(t => clearTimeout(t));
    }

    // Clear finish countdown timer
    if (duel.finishCountdownTimer) {
        clearTimeout(duel.finishCountdownTimer);
        duel.finishCountdownTimer = null;
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

    // Draw conditions:
    // 1. Nobody won (both failed)
    // 2. Both won with exactly the same time
    // 3. Both solved the puzzle (both won = draw, since second solved within 5s countdown)
    const isDraw = !finishers.length ||
        (finishers.length === 2 && finishers[0][1].time === finishers[1][1].time);

    const result = {
        winnerId: winner ? winner[1].playerId : null,
        winnerName: winner ? winner[1].playerName : null,
        winnerTime: winner ? winner[1].time : 0,
        winnerStars: winner ? winner[1].stars || 0 : 0,
        loserId: loser ? loser[1].playerId : null,
        loserName: loser ? loser[1].playerName : null,
        loserTime: loser ? loser[1].time : 0,
        loserStars: loser ? loser[1].stars || 0 : 0,
        isDraw,
        isBot: duel.isBot,
        isBet: duel.isBet || false,
        betAmount: duel.betAmount || 0
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
// GRACEFUL SHUTDOWN
// =============================================
function gracefulShutdown(signal) {
    console.log(`${signal} received. Shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
        console.log('HTTP server closed');
    });

    // Clear duel cleanup interval
    clearInterval(duelCleanupInterval);

    // Clear all active duel bot intervals
    for (const duel of Object.values(activeduels)) {
        if (duel.botIntervals) {
            duel.botIntervals.forEach(t => clearTimeout(t));
        }
    }

    // Close all socket connections
    io.close(() => {
        console.log('WebSocket server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================
// START SERVER
// =============================================
server.listen(PORT, () => {
    console.log(`В тему! game server running on http://localhost:${PORT}`);
});
