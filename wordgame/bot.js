/**
 * bot.js — Telegram bot for daily/weekly puzzle notifications
 *
 * Features:
 * - Sends daily puzzle notification every morning
 * - Sends weekly puzzle notification every Monday
 * - Provides /start, /daily, /weekly commands
 * - Links to the Telegram Mini App
 *
 * Requires: BOT_TOKEN, WEBAPP_URL environment variables
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-domain.com';
const SUBSCRIBERS_FILE = path.join(__dirname, 'data', 'subscribers.json');
const BONUS_UNLOCKS_FILE = path.join(__dirname, 'data', 'bonus_unlocks.json');

if (!BOT_TOKEN) {
    console.error('BOT_TOKEN environment variable is required!');
    throw new Error('BOT_TOKEN environment variable is required');
}

// Count bonus words from wordsunlocked.js (4 puzzles × 4 categories × 4 words)
const BONUS_WORDS_COUNT = 4 * 4 * 4;

// Feature flag: set to true to enable the "Открыть доп.слова" button
const BONUS_BUTTON_ENABLED = false;

// =============================================
// SUBSCRIBER STORE
// =============================================
function ensureDataDir() {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSubscribers() {
    try {
        ensureDataDir();
        if (fs.existsSync(SUBSCRIBERS_FILE)) {
            return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading subscribers:', e.message);
    }
    return { chatIds: [], settings: {} };
}

function saveSubscribers(data) {
    try {
        ensureDataDir();
        fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving subscribers:', e.message);
    }
}

let subscribers = loadSubscribers();

// =============================================
// BONUS UNLOCKS (single source of truth: bonus_unlocks.json)
// =============================================
function loadBonusUnlocks() {
    try {
        ensureDataDir();
        if (fs.existsSync(BONUS_UNLOCKS_FILE)) {
            return JSON.parse(fs.readFileSync(BONUS_UNLOCKS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading bonus unlocks:', e.message);
    }
    return { users: {} };
}

function saveBonusUnlocks(data) {
    try {
        ensureDataDir();
        fs.writeFileSync(BONUS_UNLOCKS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving bonus unlocks:', e.message);
    }
}

function isBonusUnlocked(chatId) {
    const data = loadBonusUnlocks();
    return !!data.users[String(chatId)];
}

function addSubscriber(chatId) {
    if (!subscribers.chatIds.includes(chatId)) {
        subscribers.chatIds.push(chatId);
        if (!subscribers.settings[chatId]) {
            subscribers.settings[chatId] = { daily: true, weekly: true };
        }
        saveSubscribers(subscribers);
    }
}

function removeSubscriber(chatId) {
    subscribers.chatIds = subscribers.chatIds.filter(id => id !== chatId);
    delete subscribers.settings[chatId];
    saveSubscribers(subscribers);
}

// =============================================
// BOT INITIALIZATION
// =============================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('Telegram bot started in polling mode');

// =============================================
// COMMAND HANDLERS
// =============================================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    addSubscriber(chatId);

    const bonusUnlocked = isBonusUnlocked(chatId);

    const welcomeText = `Привет! Добро пожаловать в *В тему!* — словесную головоломку!

*Как играть:*
Перед тобой 16 слов — найди 4 группы по 4 слова, которые объединяет общая тема. Выбери слова и нажми «Проверить».

🏆 *Еженедельный паззл* — сложный челлендж на время. Кто быстрее?
⚔️ *Дуэль* — сражайся с другими игроками!
🥇 *Лидерборд* — соревнуйся с другими игроками!

Нажми кнопку ниже, чтобы начать игру!`;

    const keyboard = [
        [{ text: '🎮 Играть в «В тему!»', web_app: { url: WEBAPP_URL } }]
    ];

    // Only show bonus words button if enabled and not yet unlocked
    if (BONUS_BUTTON_ENABLED && !bonusUnlocked) {
        keyboard.push([{ text: '🎁 Открыть доп.слова', callback_data: 'unlock_bonus_words' }]);
    }

    const imageUrl = `https://raw.githubusercontent.com/mooodev/tools/refs/heads/main/images/vtemumenu.jpg?v=${Date.now()}`;

    bot.sendPhoto(chatId, imageUrl, {
        caption: welcomeText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
});

bot.onText(/\/weekly/, (msg) => {
    const chatId = msg.chat.id;
    addSubscriber(chatId);

    bot.sendMessage(chatId, '🏆 *Еженедельный паззл* — для настоящих знатоков!\n\nОдин сложный паззл на всю неделю. Справишься?', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🧠 Открыть еженедельный паззл', web_app: { url: `${WEBAPP_URL}?mode=weekly` } }]
            ]
        }
    });
});

bot.onText(/\/play/, (msg) => {
    const chatId = msg.chat.id;
    addSubscriber(chatId);

    bot.sendMessage(chatId, '🎮 Открывай игру и начинай играть!', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎮 Играть в «В тему!»', web_app: { url: WEBAPP_URL } }]
            ]
        }
    });
});

bot.onText(/\/notifications/, (msg) => {
    const chatId = msg.chat.id;
    addSubscriber(chatId);

    const settings = subscribers.settings[chatId] || { weekly: true };
    const weeklyStatus = settings.weekly ? '✅' : '❌';

    bot.sendMessage(chatId, `⚙️ *Настройки уведомлений:*\n\n${weeklyStatus} Еженедельные паззлы`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${settings.weekly ? '🔕' : '🔔'} Еженедельные`, callback_data: 'toggle_weekly' }
                ]
            ]
        }
    });
});

bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    removeSubscriber(chatId);
    bot.sendMessage(chatId, '🔕 Ты отписался от уведомлений. Используй /start чтобы подписаться снова.');
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `*В тему! — Словесная головоломка*

*Как играть:*
Перед тобой 16 слов — найди 4 группы по 4 слова, которые объединяет общая тема. Выбери слова и нажми «Проверить».

🏆 *Еженедельный паззл* — сложный челлендж на время. Кто быстрее?
⚔️ *Дуэль* — сражайся с другими игроками!
🥇 *Лидерборд* — соревнуйся с другими игроками!`, {
        parse_mode: 'Markdown'
    });
});

// =============================================
// CALLBACK QUERIES (notification toggles)
// =============================================
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    if (!subscribers.settings[chatId]) {
        subscribers.settings[chatId] = { daily: true, weekly: true };
    }

    if (query.data === 'unlock_bonus_words') {
        // Mark as unlocked in bonus_unlocks.json (single source of truth)
        const bonusData = loadBonusUnlocks();
        bonusData.users[String(chatId)] = {
            unlockedAt: new Date().toISOString(),
            telegramId: String(chatId),
            userId: null
        };
        saveBonusUnlocks(bonusData);

        bot.answerCallbackQuery(query.id, {
            text: `🎁 Вы открыли новую подборку из ${BONUS_WORDS_COUNT} слов!`,
            show_alert: true
        });

        // Edit original message to remove the bonus button (gift opened)
        bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: '🎮 Играть в «В тему!»', web_app: { url: WEBAPP_URL } }]] },
            { chat_id: chatId, message_id: query.message.message_id }
        ).catch(() => { /* message may be too old to edit */ });

        // Send new message with link that unlocks bonus words in the webapp
        const unlockUrl = `${WEBAPP_URL}?unlock_bonus=1`;
        bot.sendMessage(chatId, `🎁 *Вы открыли новую подборку из ${BONUS_WORDS_COUNT} слов!*\n\n4 бонусных паззла добавлены ко всем уровням сложности. Открой игру и попробуй!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 Играть с новыми словами', web_app: { url: unlockUrl } }]
                ]
            }
        });
        return;
    }

    if (query.data === 'toggle_weekly') {
        subscribers.settings[chatId].weekly = !subscribers.settings[chatId].weekly;
        saveSubscribers(subscribers);
    }

    const settings = subscribers.settings[chatId];
    const weeklyStatus = settings.weekly ? '✅' : '❌';

    bot.editMessageText(`⚙️ *Настройки уведомлений:*\n\n${weeklyStatus} Еженедельные паззлы`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${settings.weekly ? '🔕' : '🔔'} Еженедельные`, callback_data: 'toggle_weekly' }
                ]
            ]
        }
    });

    bot.answerCallbackQuery(query.id, { text: 'Настройки обновлены!' });
});

// =============================================
// SCHEDULED NOTIFICATIONS
// =============================================

/**
 * Load weekly speed data to check previous week ranks.
 */
const WEEKLY_SPEED_FILE = path.join(__dirname, 'data', 'weekly_speed.json');

function loadWeeklySpeed() {
    try {
        if (fs.existsSync(WEEKLY_SPEED_FILE)) {
            return JSON.parse(fs.readFileSync(WEEKLY_SPEED_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading weekly speed:', e.message);
    }
    return { weeks: {} };
}

function getPreviousWeekId() {
    const now = new Date();
    const prevWeek = new Date(now);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const day = prevWeek.getDay() || 7;
    prevWeek.setDate(prevWeek.getDate() + 4 - day);
    const year = prevWeek.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const weekNum = Math.ceil(((prevWeek - jan1) / 86400000 + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = String(seconds % 60).padStart(2, '0');
    return `${min}:${sec}`;
}

/**
 * Send weekly puzzle notification to all subscribers.
 * Called every Monday at 10:00 Moscow time.
 * Includes previous week's speed rank if player participated.
 */
async function sendWeeklyNotification() {
    const weeklySubs = subscribers.chatIds.filter(id => {
        const settings = subscribers.settings[id];
        return !settings || settings.weekly !== false;
    });

    console.log(`Sending weekly notification to ${weeklySubs.length} subscribers`);

    // Load previous week's speed data
    const speedData = loadWeeklySpeed();
    const prevWeekId = getPreviousWeekId();
    const prevWeekEntries = speedData.weeks[prevWeekId] ? Object.values(speedData.weeks[prevWeekId]) : [];
    prevWeekEntries.sort((a, b) => a.time - b.time);

    for (const chatId of weeklySubs) {
        try {
            const playerId = 'tg_' + chatId;
            let message = '🏆 *Новый еженедельный паззл!*\n\nСложный паззл на всю неделю. Покажи свой уровень!';

            // Check if player participated in previous week's speed leaderboard
            const prevIdx = prevWeekEntries.findIndex(e => e.id === playerId);
            if (prevIdx !== -1) {
                const rank = prevIdx + 1;
                const total = prevWeekEntries.length;
                const time = prevWeekEntries[prevIdx].time;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
                message = `🏆 *Новый еженедельный паззл!*\n\n⚡ На прошлой неделе ты прошёл за *${formatTime(time)}* — *${medal}${rank} место* из ${total}!\n\nСложный паззл на всю неделю. Покажи свой уровень!`;
            }

            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🧠 Принять вызов', web_app: { url: `${WEBAPP_URL}?mode=weekly` } }]
                    ]
                }
            });
        } catch (e) {
            console.error(`Failed to send weekly notification to ${chatId}:`, e.message);
            if (e.response && e.response.statusCode === 403) {
                removeSubscriber(chatId);
            }
        }
    }
}

// =============================================
// SCHEDULER
// =============================================
function scheduleNotifications() {
    // Calculate next Monday at target hour in Moscow time (UTC+3)
    function getNextMondayMoscow(targetHour) {
        const now = new Date();
        const utcHour = targetHour - 3; // Moscow is UTC+3
        const next = new Date();
        next.setUTCHours(utcHour, 0, 0, 0);

        // Find next Monday
        const dayOfWeek = next.getUTCDay();
        const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
        if (dayOfWeek === 1 && next > now) {
            // It's Monday and the time hasn't passed yet
        } else {
            next.setUTCDate(next.getUTCDate() + (dayOfWeek === 1 && next <= now ? 7 : daysUntilMonday));
        }
        return next;
    }

    // Weekly notification at 10:00 Moscow on Mondays
    function scheduleWeeklyCheck() {
        const nextWeekly = getNextMondayMoscow(10);
        const delay = nextWeekly.getTime() - Date.now();

        console.log(`Next weekly notification in ${Math.round(delay / 60000)} minutes`);

        setTimeout(() => {
            sendWeeklyNotification();
            scheduleWeeklyCheck();
        }, delay);
    }

    scheduleWeeklyCheck();
}

// Start the scheduler
scheduleNotifications();

// =============================================
// EXPORT FOR SERVER INTEGRATION
// =============================================
module.exports = { bot, sendWeeklyNotification };
