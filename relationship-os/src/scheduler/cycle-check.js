const prisma = require('../db/prisma');
const { InlineKeyboard } = require('grammy');

/**
 * Monthly reminder for girls to update cycle data.
 */
async function checkCycleUpdates(bot) {
  const girls = await prisma.user.findMany({
    where: {
      gender: 'FEMALE',
      onboardingDone: true,
      pausedAt: null,
    },
    include: { cycle: true },
  });

  for (const girl of girls) {
    if (!girl.cycle) continue;

    const kb = new InlineKeyboard()
      .text('Сегодня', 'cycle_upd:0').text('Вчера', 'cycle_upd:1').row()
      .text('2-3 дня назад', 'cycle_upd:3').text('Неделю назад', 'cycle_upd:7').row()
      .text('Всё без изменений ✅', 'cycle_upd:skip');

    await bot.api.sendMessage(
      girl.telegramId.toString(),
      '🌙 Ежемесячная проверка!\n\nКогда начались последние месячные?\n_(это помогает мне лучше подбирать советы для вас обоих)_',
      { parse_mode: 'Markdown', reply_markup: kb }
    ).catch(() => {});
  }
}

module.exports = { checkCycleUpdates };
