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

if (!BOT_TOKEN) {
    console.error('BOT_TOKEN environment variable is required!');
    process.exit(1);
}

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

    const welcomeText = `Привет! Я бот игры *В тему!* — словесная головоломка!

Каждый день я присылаю новый паззл, а каждую неделю — сложный челлендж.

*Команды:*
/daily — Открыть ежедневный паззл
/weekly — Открыть еженедельный паззл
/play — Открыть игру
/notifications — Настроить уведомления
/stop — Отписаться от уведомлений
/help — Помощь

Нажми кнопку ниже, чтобы начать игру!`;

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎮 Играть в «В тему!»', web_app: { url: WEBAPP_URL } }],
                [{ text: '📅 Ежедневный паззл', web_app: { url: `${WEBAPP_URL}?mode=daily` } }],
                [{ text: '🏆 Еженедельный паззл', web_app: { url: `${WEBAPP_URL}?mode=weekly` } }]
            ]
        }
    });
});

bot.onText(/\/daily/, (msg) => {
    const chatId = msg.chat.id;
    addSubscriber(chatId);

    bot.sendMessage(chatId, '📅 *Ежедневный паззл* ждёт тебя!\n\nНовый паззл каждый день. Найди связи между словами!', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎯 Открыть ежедневный паззл', web_app: { url: `${WEBAPP_URL}?mode=daily` } }]
            ]
        }
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

    const settings = subscribers.settings[chatId] || { daily: true, weekly: true };
    const dailyStatus = settings.daily ? '✅' : '❌';
    const weeklyStatus = settings.weekly ? '✅' : '❌';

    bot.sendMessage(chatId, `⚙️ *Настройки уведомлений:*\n\n${dailyStatus} Ежедневные паззлы\n${weeklyStatus} Еженедельные паззлы`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${settings.daily ? '🔕' : '🔔'} Ежедневные`, callback_data: 'toggle_daily' },
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

16 слов, 4 категории. Найди скрытые связи!

*Команды:*
/start — Начать и подписаться
/daily — Ежедневный паззл
/weekly — Еженедельный паззл
/play — Открыть игру
/notifications — Настройки уведомлений
/stop — Отписаться
/help — Эта справка

*Как играть:*
1. Выбери 4 слова, которые объединяет одна тема
2. Нажми «Проверить»
3. Угадай все 4 группы с минимальным числом ошибок
4. Получай звёзды, монеты и достижения!`, {
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

    if (query.data === 'toggle_daily') {
        subscribers.settings[chatId].daily = !subscribers.settings[chatId].daily;
        saveSubscribers(subscribers);
    } else if (query.data === 'toggle_weekly') {
        subscribers.settings[chatId].weekly = !subscribers.settings[chatId].weekly;
        saveSubscribers(subscribers);
    }

    const settings = subscribers.settings[chatId];
    const dailyStatus = settings.daily ? '✅' : '❌';
    const weeklyStatus = settings.weekly ? '✅' : '❌';

    bot.editMessageText(`⚙️ *Настройки уведомлений:*\n\n${dailyStatus} Ежедневные паззлы\n${weeklyStatus} Еженедельные паззлы`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${settings.daily ? '🔕' : '🔔'} Ежедневные`, callback_data: 'toggle_daily' },
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
 * Send daily puzzle notification to all subscribers.
 * Called every day at 09:00 Moscow time.
 */
async function sendDailyNotification() {
    const dailySubs = subscribers.chatIds.filter(id => {
        const settings = subscribers.settings[id];
        return !settings || settings.daily !== false;
    });

    console.log(`Sending daily notification to ${dailySubs.length} subscribers`);

    for (const chatId of dailySubs) {
        try {
            await bot.sendMessage(chatId, '📅 *Новый ежедневный паззл!*\n\nСвежий паззл уже ждёт тебя. Найди все связи!', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎯 Играть', web_app: { url: `${WEBAPP_URL}?mode=daily` } }]
                    ]
                }
            });
        } catch (e) {
            console.error(`Failed to send daily notification to ${chatId}:`, e.message);
            // Remove blocked/deleted chats
            if (e.response && e.response.statusCode === 403) {
                removeSubscriber(chatId);
            }
        }
    }
}

/**
 * Send weekly puzzle notification to all subscribers.
 * Called every Monday at 10:00 Moscow time.
 */
async function sendWeeklyNotification() {
    const weeklySubs = subscribers.chatIds.filter(id => {
        const settings = subscribers.settings[id];
        return !settings || settings.weekly !== false;
    });

    console.log(`Sending weekly notification to ${weeklySubs.length} subscribers`);

    for (const chatId of weeklySubs) {
        try {
            await bot.sendMessage(chatId, '🏆 *Новый еженедельный паззл!*\n\nСложный паззл на всю неделю. Покажи свой уровень!', {
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
    const now = new Date();

    // Calculate next 09:00 Moscow time (UTC+3)
    function getNextMoscowHour(targetHour) {
        const utcHour = targetHour - 3; // Moscow is UTC+3
        const next = new Date();
        next.setUTCHours(utcHour, 0, 0, 0);
        if (next <= now) {
            next.setUTCDate(next.getUTCDate() + 1);
        }
        return next;
    }

    // Daily notification at 09:00 Moscow
    function scheduleDailyCheck() {
        const nextDaily = getNextMoscowHour(9);
        const delay = nextDaily.getTime() - Date.now();

        console.log(`Next daily notification in ${Math.round(delay / 60000)} minutes`);

        setTimeout(() => {
            sendDailyNotification();

            // Also check if it's Monday for weekly
            const dayOfWeek = new Date().getUTCDay();
            // Need to check Moscow day: if UTC hour < 3, Moscow day = UTC day
            // For 06:00 UTC (09:00 Moscow), Moscow day = same as UTC day
            if (dayOfWeek === 1) {
                // Monday: schedule weekly for 10:00 Moscow (1 hour later)
                setTimeout(() => {
                    sendWeeklyNotification();
                }, 60 * 60 * 1000);
            }

            // Schedule next day
            scheduleDailyCheck();
        }, delay);
    }

    scheduleDailyCheck();
}

// Start the scheduler
scheduleNotifications();

// =============================================
// EXPORT FOR SERVER INTEGRATION
// =============================================
module.exports = { bot, sendDailyNotification, sendWeeklyNotification };
