const { setupOnboarding } = require('./onboarding');
const { setupDaily } = require('./daily');
const { setupRelay } = require('./relay');
const { setupSettings } = require('./settings');
const { setupCommands } = require('./commands');

function setupHandlers(bot) {
  // Commands
  setupCommands(bot);

  // Onboarding flow
  setupOnboarding(bot);

  // Daily check-in handlers
  setupDaily(bot);

  // Relay message handlers
  setupRelay(bot);

  // Settings handlers
  setupSettings(bot);

  // Fallback for unexpected text
  bot.on('message:text', async (ctx) => {
    if (ctx.session.state === 'AWAITING_FREE_TEXT') return; // handled by relay
    if (!ctx.session.onboardingDone) return; // handled by onboarding

    await ctx.reply('Я работаю через кнопки 😄 Напиши /help если что-то пошло не так');
  });
}

module.exports = { setupHandlers };
