const { InlineKeyboard } = require('grammy');

const girlMoodKeyboard = new InlineKeyboard()
  .text('😊 Хорошо', 'daily_mood:5')
  .text('😐 Норм', 'daily_mood:3')
  .row()
  .text('😔 Не очень', 'daily_mood:2')
  .text('😤 Сложный день', 'daily_mood:1');

const guyMoodKeyboard = new InlineKeyboard()
  .text('💪 Огонь', 'daily_guy_mood:5')
  .text('👍 Норм', 'daily_guy_mood:4')
  .row()
  .text('😮‍💨 Устал', 'daily_guy_mood:2')
  .text('💀 Выгораю', 'daily_guy_mood:1');

module.exports = { girlMoodKeyboard, guyMoodKeyboard };
