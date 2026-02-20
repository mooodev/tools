require('dotenv').config();

const { createBot } = require('./bot/bot');
const { createServer } = require('./web/server');
const { getDb } = require('./db/database');
const { processRecurringExpenses } = require('./services/recurringService');
const cron = require('node-cron');

// Validate configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = parseInt(process.env.PORT) || 3000;

if (!BOT_TOKEN || BOT_TOKEN === 'your_telegram_bot_token_here') {
  console.error('='.repeat(60));
  console.error('ERROR: BOT_TOKEN is not configured!');
  console.error('');
  console.error('Please set your Telegram bot token:');
  console.error('1. Copy .env.example to .env');
  console.error('2. Get a token from @BotFather on Telegram');
  console.error('3. Set BOT_TOKEN=your_token in .env');
  console.error('='.repeat(60));
  console.error('');
  console.error('Starting web server only (without Telegram bot)...');
  console.error('');
}

// Initialize database
console.log('Initializing database...');
getDb();
console.log('Database ready.');

// Start web server
console.log(`Starting web server on port ${PORT}...`);
const server = createServer(PORT);

// Start Telegram bot (if token configured)
if (BOT_TOKEN && BOT_TOKEN !== 'your_telegram_bot_token_here') {
  console.log('Starting Telegram bot...');
  try {
    const bot = createBot(BOT_TOKEN);
    console.log('Telegram bot started successfully!');

    // Process recurring expenses every day at 9:00 AM
    cron.schedule('0 9 * * *', () => {
      console.log('Processing recurring expenses...');
      try {
        const processed = processRecurringExpenses();
        if (processed.length > 0) {
          console.log(`Processed ${processed.length} recurring expenses.`);
        }
      } catch (err) {
        console.error('Error processing recurring expenses:', err);
      }
    });
  } catch (err) {
    console.error('Failed to start Telegram bot:', err.message);
  }
}

console.log('');
console.log('='.repeat(60));
console.log('  Сочтёмся / Splitwise Bot is running!');
console.log('');
console.log(`  Web interface: http://localhost:${PORT}`);
if (BOT_TOKEN && BOT_TOKEN !== 'your_telegram_bot_token_here') {
  console.log('  Telegram bot: active');
}
console.log('='.repeat(60));
console.log('');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  const db = getDb();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  const db = getDb();
  db.close();
  process.exit(0);
});
