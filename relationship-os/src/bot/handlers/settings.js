const prisma = require('../../db/prisma');
const { InlineKeyboard } = require('grammy');

function setupSettings(bot) {
  bot.command('settings', async (ctx) => {
    if (!ctx.dbUser) return ctx.reply('Сначала зарегистрируйся: /start');

    const user = await prisma.user.findUnique({ where: { id: ctx.dbUser.id } });

    const kb = new InlineKeyboard()
      .text('🕐 Часовой пояс', 'settings:timezone').row()
      .text('🔔 Уведомления', 'settings:notifications').row()
      .text('📊 Мои данные', 'settings:mydata');

    await ctx.reply(
      `⚙️ *Настройки*\n\n` +
      `Часовой пояс: ${user.timezone}\n` +
      `Пауза: ${user.pausedAt ? '⏸ Да' : '▶️ Нет'}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  bot.callbackQuery('settings:timezone', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('Москва (UTC+3)', 'tz:Europe/Moscow').row()
      .text('Киев (UTC+2)', 'tz:Europe/Kiev').row()
      .text('Минск (UTC+3)', 'tz:Europe/Minsk').row()
      .text('Алматы (UTC+6)', 'tz:Asia/Almaty');

    await ctx.reply('Выбери часовой пояс:', { reply_markup: kb });
  });

  bot.callbackQuery(/^tz:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Сохранено');
    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { timezone: ctx.match[1] },
    });
    await ctx.reply(`✅ Часовой пояс: ${ctx.match[1]}`);
  });

  bot.callbackQuery('settings:notifications', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('⏸ Пауза', 'notif:pause')
      .text('▶️ Возобновить', 'notif:resume');

    await ctx.reply('Управление уведомлениями:', { reply_markup: kb });
  });

  bot.callbackQuery('notif:pause', async (ctx) => {
    await ctx.answerCallbackQuery('Уведомления приостановлены');
    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { pausedAt: new Date() },
    });
  });

  bot.callbackQuery('notif:resume', async (ctx) => {
    await ctx.answerCallbackQuery('Уведомления возобновлены');
    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { pausedAt: null },
    });
  });

  bot.callbackQuery('settings:mydata', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await prisma.user.findUnique({
      where: { id: ctx.dbUser.id },
      include: { cycle: true },
    });

    const lines = [
      `👤 *Твои данные*\n`,
      `Имя: ${user.firstName}`,
      `Пол: ${user.gender === 'MALE' ? 'М' : 'Ж'}`,
      `Тип привязанности: ${user.attachmentType || '—'}`,
      `Язык любви: ${user.loveLanguage || '—'}`,
      `Стиль конфликта: ${user.conflictStyle || '—'}`,
      `Стресс: ${user.stressLevel}/5`,
    ];

    if (user.cycle) {
      lines.push(`\n📅 *Цикл*`);
      lines.push(`Длина: ${user.cycle.cycleLength} дней`);
      lines.push(`Менструация: ${user.cycle.periodLength} дней`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  });
}

module.exports = { setupSettings };
