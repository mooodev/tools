const prisma = require('../../db/prisma');
const { InlineKeyboard } = require('grammy');

function setupCommands(bot) {
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📋 *Команды RelationshipOS*\n\n' +
      '/start — Начать или войти\n' +
      '/cycle — Обновить данные цикла\n' +
      '/stress — Обновить уровень стресса\n' +
      '/challenge — Текущий челлендж\n' +
      '/stats — Статистика пары\n' +
      '/invite — Ссылка для партнёра\n' +
      '/pause — Поставить на паузу\n' +
      '/resume — Возобновить\n' +
      '/settings — Настройки\n' +
      '/help — Эта справка',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('invite', async (ctx) => {
    if (!ctx.dbUser?.pairId) {
      return ctx.reply('Ты ещё не создал пару. Напиши /start');
    }
    const pair = await prisma.pair.findUnique({ where: { id: ctx.dbUser.pairId } });
    if (!pair) return;

    const botInfo = await ctx.api.getMe();
    await ctx.reply(
      `📨 Ссылка-приглашение для партнёра:\n\n` +
      `https://t.me/${botInfo.username}?start=${pair.inviteCode}\n\n` +
      `Отправь эту ссылку своей второй половинке 💌`
    );
  });

  bot.command('pause', async (ctx) => {
    if (!ctx.dbUser) return;
    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { pausedAt: new Date() },
    });
    await ctx.reply('⏸ Уведомления приостановлены. Напиши /resume чтобы возобновить');
  });

  bot.command('resume', async (ctx) => {
    if (!ctx.dbUser) return;
    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { pausedAt: null },
    });
    await ctx.reply('▶️ Уведомления возобновлены!');
  });

  bot.command('stats', async (ctx) => {
    if (!ctx.dbUser?.pairId) {
      return ctx.reply('Сначала создай пару через /start');
    }
    const pair = await prisma.pair.findUnique({
      where: { id: ctx.dbUser.pairId },
      include: { users: true },
    });
    if (!pair) return;

    const levels = [
      '🌱 Знакомство',
      '🤝 Связь',
      '💛 Доверие',
      '⚡ Команда',
      '👑 Легендарная пара',
    ];
    const levelName = levels[Math.min(pair.level - 1, levels.length - 1)];

    await ctx.reply(
      `📊 *Статистика пары*\n\n` +
      `📅 Дней вместе: ${pair.dayCount}\n` +
      `⭐ Очки: ${pair.points}\n` +
      `🏆 Уровень: ${levelName}\n`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('challenge', async (ctx) => {
    if (!ctx.dbUser?.pairId) return ctx.reply('Сначала создай пару');

    const active = await prisma.pairChallenge.findFirst({
      where: { pairId: ctx.dbUser.pairId, status: 'ACTIVE' },
    });

    if (!active) {
      return ctx.reply('Сейчас нет активного челленджа. Новый придёт в воскресенье!');
    }

    const { getChallengeByKey } = require('../../content/challenges');
    const challenge = getChallengeByKey(active.challengeKey);
    if (!challenge) return;

    const text = ctx.dbUser.gender === 'MALE' ? challenge.guy : challenge.girl;
    const status = [];
    if (active.guyDone) status.push('✅ Он выполнил');
    else status.push('⏳ Он ещё нет');
    if (active.girlDone) status.push('✅ Она выполнила');
    else status.push('⏳ Она ещё нет');

    const kb = new InlineKeyboard();
    const myDone = ctx.dbUser.gender === 'MALE' ? active.guyDone : active.girlDone;
    if (!myDone) {
      kb.text('✅ Сделано!', `challenge_done:${active.id}`);
    }

    await ctx.reply(
      `🎯 *Текущий челлендж*\n\n${text}\n\n${status.join('\n')}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  // Challenge done callback
  bot.callbackQuery(/^challenge_done:(\d+)$/, async (ctx) => {
    const challengeId = parseInt(ctx.match[1]);
    const challenge = await prisma.pairChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.status !== 'ACTIVE') {
      return ctx.answerCallbackQuery('Этот челлендж уже завершён');
    }

    const field = ctx.dbUser.gender === 'MALE' ? 'guyDone' : 'girlDone';
    const update = { [field]: true };

    // Check if both done
    const otherDone = ctx.dbUser.gender === 'MALE' ? challenge.girlDone : challenge.guyDone;
    if (otherDone) {
      update.status = 'COMPLETED';
      update.completedAt = new Date();
      // Award points
      await prisma.pair.update({
        where: { id: challenge.pairId },
        data: { points: { increment: 50 } },
      });
    }

    await prisma.pairChallenge.update({ where: { id: challengeId }, data: update });

    if (otherDone) {
      await ctx.answerCallbackQuery('🏆 Челлендж выполнен! +50 очков!');
      // Notify both
      const users = await prisma.user.findMany({ where: { pairId: challenge.pairId } });
      for (const u of users) {
        await ctx.api.sendMessage(
          u.telegramId.toString(),
          '🏆 Вы оба выполнили челлендж! +50 очков паре!'
        ).catch(() => {});
      }
    } else {
      await ctx.answerCallbackQuery('✅ Отмечено! Ждём партнёра');
    }
  });
}

module.exports = { setupCommands };
