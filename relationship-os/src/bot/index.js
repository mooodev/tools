require('dotenv').config();
const { Bot, session } = require('grammy');
const { setupHandlers } = require('./handlers/index');
const { authMiddleware } = require('./middleware/auth');
const { redisSession } = require('./middleware/session');
const { startScheduler } = require('../scheduler/index');

const bot = new Bot(process.env.BOT_TOKEN);

// Session middleware (Redis-backed)
bot.use(redisSession());

// Auth middleware — ensures user exists in DB
bot.use(authMiddleware);

// Register all handlers
setupHandlers(bot);

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start
async function main() {
  console.log('RelationshipOS bot starting...');

  // Start scheduler for daily pushes
  startScheduler(bot);

  if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
    await bot.api.setWebhook(process.env.WEBHOOK_URL);
    console.log('Webhook set:', process.env.WEBHOOK_URL);
  } else {
    await bot.start();
    console.log('Bot started in polling mode');
  }
}

main().catch(console.error);

module.exports = { bot };
