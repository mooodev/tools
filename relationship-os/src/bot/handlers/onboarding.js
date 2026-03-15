const prisma = require('../../db/prisma');
const { InlineKeyboard } = require('grammy');
const { nanoid } = require('nanoid');
const { onboardingKeyboards } = require('../keyboards/onboarding');

// Onboarding steps per gender
const GIRL_STEPS = [
  'GIRL_WELCOME',
  'GIRL_CYCLE_START',
  'GIRL_CYCLE_LENGTH',
  'GIRL_PERIOD_LENGTH',
  'GIRL_ATTACHMENT_1',
  'GIRL_ATTACHMENT_2',
  'GIRL_ATTACHMENT_3',
  'GIRL_LOVE_LANG',
  'GIRL_CONFLICT',
  'GIRL_STRESS',
  'GIRL_ABOUT_HIM',
  'GIRL_DONE',
];

const GUY_STEPS = [
  'GUY_WELCOME',
  'GUY_WORKLOAD',
  'GUY_ATTACHMENT_1',
  'GUY_ATTACHMENT_2',
  'GUY_ATTACHMENT_3',
  'GUY_REACTION_STYLE',
  'GUY_LOVE_LANG',
  'GUY_STRESS_SIGNALS',
  'GUY_ABOUT_HER',
  'GUY_DONE',
];

function getSteps(gender) {
  return gender === 'FEMALE' ? GIRL_STEPS : GUY_STEPS;
}

function setupOnboarding(bot) {
  // /start — entry point
  bot.command('start', async (ctx) => {
    const args = ctx.match; // invite code if any

    // Already registered and onboarded
    if (ctx.session.onboardingDone) {
      return ctx.reply('С возвращением! 💕 Напиши /help чтобы увидеть команды');
    }

    // Already exists but not finished onboarding
    if (ctx.session.userId) {
      return sendOnboardingStep(ctx);
    }

    // New user with invite code — join existing pair
    if (args) {
      const pair = await prisma.pair.findUnique({ where: { inviteCode: args } });
      if (pair) {
        ctx.session.inviteCode = args;
        ctx.session.joiningPair = pair.id;
      }
    }

    // Ask gender
    const kb = new InlineKeyboard()
      .text('👨 Мужчина', 'gender:MALE')
      .text('👩 Женщина', 'gender:FEMALE');

    await ctx.reply(
      '👋 Привет! Я *RelationshipOS* — твой личный тренер отношений.\n\n' +
      'Для начала — кто ты?',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  // Gender selection
  bot.callbackQuery(/^gender:(MALE|FEMALE)$/, async (ctx) => {
    const gender = ctx.match[1];
    await ctx.answerCallbackQuery();

    let pairId = ctx.session.joiningPair || null;
    let inviteCode = null;

    // Create pair if no invite
    if (!pairId) {
      inviteCode = nanoid(6).toUpperCase();
      const pair = await prisma.pair.create({ data: { inviteCode } });
      pairId = pair.id;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        telegramId: BigInt(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name || 'User',
        gender,
        pairId,
        onboardingStep: 0,
      },
    });

    ctx.session.userId = user.id;
    ctx.session.gender = gender;
    ctx.session.pairId = pairId;
    ctx.session.onboardingStep = 0;
    ctx.session.onboardingDone = false;
    ctx.session.inviteCode = inviteCode;

    // If joining, check if pair is now complete
    if (ctx.session.joiningPair) {
      const pairUsers = await prisma.user.findMany({ where: { pairId } });
      if (pairUsers.length >= 2) {
        await prisma.pair.update({ where: { id: pairId }, data: { status: 'ACTIVE' } });
      }
    }

    await sendOnboardingStep(ctx);
  });

  // Onboarding button callbacks
  bot.callbackQuery(/^ob:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const value = ctx.match[1];
    const gender = ctx.session.gender;
    const steps = getSteps(gender);
    const stepKey = steps[ctx.session.onboardingStep];

    // Process answer
    await processOnboardingAnswer(ctx, stepKey, value);

    // Advance step
    ctx.session.onboardingStep++;

    if (ctx.session.onboardingStep >= steps.length) {
      await finishOnboarding(ctx);
    } else {
      await sendOnboardingStep(ctx);
    }
  });

  // Free text during onboarding (ABOUT_HIM / ABOUT_HER)
  bot.on('message:text', async (ctx, next) => {
    if (ctx.session.onboardingDone || !ctx.session.userId) return next();
    const gender = ctx.session.gender;
    const steps = getSteps(gender);
    const stepKey = steps[ctx.session.onboardingStep];

    if (stepKey === 'GIRL_ABOUT_HIM' || stepKey === 'GUY_ABOUT_HER') {
      ctx.session.aboutPartnerText = ctx.message.text;
      ctx.session.onboardingStep++;

      if (ctx.session.onboardingStep >= steps.length) {
        await finishOnboarding(ctx);
      } else {
        await sendOnboardingStep(ctx);
      }
      return;
    }

    return next();
  });
}

async function sendOnboardingStep(ctx) {
  const gender = ctx.session.gender;
  const steps = getSteps(gender);
  const step = ctx.session.onboardingStep;

  if (step >= steps.length) {
    return finishOnboarding(ctx);
  }

  const stepKey = steps[step];
  const { text, keyboard } = onboardingKeyboards[stepKey] || {};

  if (!text) {
    ctx.session.onboardingStep++;
    return sendOnboardingStep(ctx);
  }

  const opts = { parse_mode: 'Markdown' };
  if (keyboard) {
    opts.reply_markup = keyboard;
  }
  await ctx.reply(text, opts);
}

async function processOnboardingAnswer(ctx, stepKey, value) {
  const userId = ctx.session.userId;

  // Attachment test — accumulate scores
  if (stepKey.includes('ATTACHMENT')) {
    if (!ctx.session.attachmentScores) {
      ctx.session.attachmentScores = { ANXIOUS: 0, AVOIDANT: 0, SECURE: 0 };
    }
    ctx.session.attachmentScores[value]++;

    // If last attachment question, compute type
    if (stepKey.endsWith('3')) {
      const scores = ctx.session.attachmentScores;
      const type = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
      await prisma.user.update({ where: { id: userId }, data: { attachmentType: type } });
    }
    return;
  }

  switch (stepKey) {
    case 'GIRL_CYCLE_START': {
      const daysAgo = parseInt(value) || 0;
      const lastPeriod = new Date();
      lastPeriod.setDate(lastPeriod.getDate() - daysAgo);
      ctx.session.cycleLastPeriod = lastPeriod.toISOString();
      break;
    }
    case 'GIRL_CYCLE_LENGTH':
      ctx.session.cycleLength = parseInt(value) || 28;
      break;
    case 'GIRL_PERIOD_LENGTH': {
      const periodLength = parseInt(value) || 5;
      await prisma.cycle.create({
        data: {
          userId,
          lastPeriodStart: new Date(ctx.session.cycleLastPeriod),
          cycleLength: ctx.session.cycleLength || 28,
          periodLength,
          isIrregular: ctx.session.cycleLength === 0,
        },
      });
      break;
    }
    case 'GIRL_LOVE_LANG':
    case 'GUY_LOVE_LANG':
      await prisma.user.update({ where: { id: userId }, data: { loveLanguage: value } });
      break;
    case 'GIRL_CONFLICT':
    case 'GUY_REACTION_STYLE':
      await prisma.user.update({ where: { id: userId }, data: { conflictStyle: value } });
      break;
    case 'GIRL_STRESS':
    case 'GUY_WORKLOAD': {
      const stress = parseInt(value) || 3;
      await prisma.user.update({
        where: { id: userId },
        data: { stressLevel: stress, stressUpdatedAt: new Date() },
      });
      break;
    }
    case 'GUY_STRESS_SIGNALS':
      // Informational, no DB update needed
      break;
  }
}

async function finishOnboarding(ctx) {
  const userId = ctx.session.userId;

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingDone: true },
  });
  ctx.session.onboardingDone = true;

  const gender = ctx.session.gender;

  // Save about-partner text as relay message
  if (ctx.session.aboutPartnerText) {
    await prisma.relayMessage.create({
      data: {
        fromUserId: userId,
        questionKey: gender === 'FEMALE' ? 'ONBOARDING_ABOUT_HIM' : 'ONBOARDING_ABOUT_HER',
        text: ctx.session.aboutPartnerText,
      },
    });
  }

  if (gender === 'MALE') {
    await ctx.reply(
      '🎮 Настройка завершена! Теперь ты на 34% более понимающий партнёр 📈'
    );
  } else {
    await ctx.reply(
      '💫 Отлично! Всё настроено. Теперь я ваш личный Купидон 💕'
    );
  }

  // Show invite code if first partner
  if (ctx.session.inviteCode) {
    const botInfo = await ctx.api.getMe();
    await ctx.reply(
      `📨 Отправь эту ссылку своей второй половинке:\n\n` +
      `https://t.me/${botInfo.username}?start=${ctx.session.inviteCode}`
    );
  }

  // Check if pair is complete — deliver onboarding relay messages
  const pair = await prisma.pair.findUnique({
    where: { id: ctx.session.pairId },
    include: { users: true },
  });

  if (pair && pair.users.length === 2 && pair.users.every(u => u.onboardingDone)) {
    await deliverOnboardingRelays(ctx, pair);
  }
}

async function deliverOnboardingRelays(ctx, pair) {
  for (const user of pair.users) {
    const relays = await prisma.relayMessage.findMany({
      where: {
        fromUserId: { not: user.id },
        questionKey: { startsWith: 'ONBOARDING_' },
        delivered: false,
      },
    });

    for (const relay of relays) {
      const intro = relay.questionKey === 'ONBOARDING_ABOUT_HER'
        ? '💌 Он написал, что его зацепило в тебе первым делом:'
        : '💌 Она написала, что её цепляет в тебе больше всего:';

      await ctx.api.sendMessage(
        user.telegramId.toString(),
        `${intro}\n\n«${relay.text}»`
      ).catch(() => {});

      await prisma.relayMessage.update({
        where: { id: relay.id },
        data: { delivered: true },
      });
    }
  }
}

module.exports = { setupOnboarding };
