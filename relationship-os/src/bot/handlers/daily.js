const prisma = require('../../db/prisma');
const { InlineKeyboard } = require('grammy');

function setupDaily(bot) {
  // Girl mood check-in
  bot.callbackQuery(/^daily_mood:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const mood = parseInt(ctx.match[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyLog.upsert({
      where: { userId_date: { userId: ctx.dbUser.id, date: today } },
      update: { mood },
      create: { userId: ctx.dbUser.id, date: today, mood },
    });

    // Ask energy
    const kb = new InlineKeyboard()
      .text('⚡ Бодрая', 'daily_energy:5')
      .text('🔋 Средне', 'daily_energy:3')
      .text('🪫 Устала', 'daily_energy:1');

    await ctx.reply('Какая энергия сегодня?', { reply_markup: kb });
  });

  // Girl energy
  bot.callbackQuery(/^daily_energy:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const energy = parseInt(ctx.match[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyLog.upsert({
      where: { userId_date: { userId: ctx.dbUser.id, date: today } },
      update: { energy },
      create: { userId: ctx.dbUser.id, date: today, energy },
    });

    // Support signal
    const kb = new InlineKeyboard()
      .text('Мне нужна поддержка 🤍', 'daily_support:yes').row()
      .text('Всё ок, не беспокойся', 'daily_support:no');

    await ctx.reply('Хочешь передать ему сигнал?', { reply_markup: kb });
  });

  // Support signal
  bot.callbackQuery(/^daily_support:(yes|no)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const needsSupport = ctx.match[1] === 'yes';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyLog.upsert({
      where: { userId_date: { userId: ctx.dbUser.id, date: today } },
      update: { needsSupport },
      create: { userId: ctx.dbUser.id, date: today, needsSupport },
    });

    if (needsSupport && ctx.dbUser.pairId) {
      // Notify partner
      const partner = await prisma.user.findFirst({
        where: { pairId: ctx.dbUser.pairId, id: { not: ctx.dbUser.id } },
      });
      if (partner) {
        await ctx.api.sendMessage(
          partner.telegramId.toString(),
          '🤍 Она сегодня просит немного поддержки. Не нужно спрашивать что случилось — просто будь рядом.'
        ).catch(() => {});
      }
    }

    await ctx.reply('Отмечено! Хорошего дня 💕');
  });

  // Guy mood check-in
  bot.callbackQuery(/^daily_guy_mood:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const mood = parseInt(ctx.match[1]);
    const stressMap = { 5: 1, 4: 2, 2: 4, 1: 5 };
    const stress = stressMap[mood] || 3;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyLog.upsert({
      where: { userId_date: { userId: ctx.dbUser.id, date: today } },
      update: { mood, stressLevel: stress },
      create: { userId: ctx.dbUser.id, date: today, mood, stressLevel: stress },
    });

    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { stressLevel: stress, stressUpdatedAt: new Date(), lastActiveAt: new Date() },
    });

    // Log stress for trend tracking
    await prisma.stressLog.create({
      data: { userId: ctx.dbUser.id, level: stress },
    });

    // Notify partner if high stress
    if (stress >= 4 && ctx.dbUser.pairId) {
      const partner = await prisma.user.findFirst({
        where: { pairId: ctx.dbUser.pairId, id: { not: ctx.dbUser.id } },
      });
      if (partner) {
        await ctx.api.sendMessage(
          partner.telegramId.toString(),
          '💙 Он сегодня немного на пределе. Сегодня хороший день обнять его без слов.'
        ).catch(() => {});
      }
    }

    await ctx.reply(stress >= 4
      ? 'Держись, бро. Она уже знает что нужно просто быть рядом 🤜🤛'
      : 'Отмечено! Хорошего дня, герой 💪'
    );
  });

  // Stress update command
  bot.command('stress', async (ctx) => {
    const kb = ctx.dbUser?.gender === 'MALE'
      ? new InlineKeyboard()
          .text('💪 Огонь', 'stress_upd:1').text('👍 Норм', 'stress_upd:2').row()
          .text('😮‍💨 Устал', 'stress_upd:4').text('💀 Выгораю', 'stress_upd:5')
      : new InlineKeyboard()
          .text('😌 Всё ок', 'stress_upd:1').text('😐 Немного', 'stress_upd:2').row()
          .text('😤 Стресс', 'stress_upd:4').text('🤯 Выгон', 'stress_upd:5');

    await ctx.reply('Как ты сейчас?', { reply_markup: kb });
  });

  bot.callbackQuery(/^stress_upd:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const stress = parseInt(ctx.match[1]);

    await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { stressLevel: stress, stressUpdatedAt: new Date() },
    });

    await prisma.stressLog.create({
      data: { userId: ctx.dbUser.id, level: stress },
    });

    await ctx.reply('✅ Уровень стресса обновлён');
  });

  // Cycle update command
  bot.command('cycle', async (ctx) => {
    if (ctx.dbUser?.gender !== 'FEMALE') {
      return ctx.reply('Эта команда доступна только для девушки');
    }
    ctx.session.state = 'AWAITING_CYCLE_UPDATE';
    ctx.session.cycleUpdateStep = 0;

    const kb = new InlineKeyboard()
      .text('Сегодня', 'cycle_upd:0').text('Вчера', 'cycle_upd:1').row()
      .text('2-3 дня назад', 'cycle_upd:3').text('Неделю назад', 'cycle_upd:7');

    await ctx.reply('🌙 Когда начались последние месячные?', { reply_markup: kb });
  });

  bot.callbackQuery(/^cycle_upd:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const daysAgo = parseInt(ctx.match[1]);
    const lastPeriod = new Date();
    lastPeriod.setDate(lastPeriod.getDate() - daysAgo);

    await prisma.cycle.upsert({
      where: { userId: ctx.dbUser.id },
      update: { lastPeriodStart: lastPeriod, updatedAt: new Date() },
      create: { userId: ctx.dbUser.id, lastPeriodStart: lastPeriod },
    });

    ctx.session.state = 'IDLE';
    await ctx.reply('✅ Данные цикла обновлены!');
  });
}

module.exports = { setupDaily };
