const prisma = require('../db/prisma');
const { getCycleContext } = require('../logic/cycle');
const { selectDailyContent, buildDailyContext } = require('../logic/content-selector');
const { getGuyMessage } = require('../content/messages-guy');
const { getGirlMessage } = require('../content/messages-girl');
const { getNextRelayKey, RELAY_QUESTIONS } = require('../content/questions-relay');
const { sendRelayQuestion } = require('../bot/handlers/relay');
const { getChallengeForWeek } = require('../content/challenges');
const { getTranslatorForWeek, formatTranslatorMessage } = require('../content/translator');
const { girlMoodKeyboard, guyMoodKeyboard } = require('../bot/keyboards/daily');
const { InlineKeyboard } = require('grammy');
const { subDays } = require('date-fns');

/**
 * Send daily push to all active pairs.
 * @param {Object} bot - Grammy bot instance
 * @param {string} type - 'morning' | 'midday' | 'evening' | 'challenge' | 'translator'
 */
async function sendDailyPush(bot, type) {
  const pairs = await prisma.pair.findMany({
    where: { status: 'ACTIVE' },
    include: {
      users: { include: { cycle: true } },
    },
  });

  for (const pair of pairs) {
    try {
      const guy = pair.users.find(u => u.gender === 'MALE');
      const girl = pair.users.find(u => u.gender === 'FEMALE');

      // Skip if either user is paused
      if (guy?.pausedAt || girl?.pausedAt) continue;

      // Activity-based degradation
      const threeDaysAgo = subDays(new Date(), 3);
      const sevenDaysAgo = subDays(new Date(), 7);

      switch (type) {
        case 'morning':
          await sendMorningPush(bot, pair, guy, girl);
          break;
        case 'midday':
          await sendMiddayPush(bot, pair, guy, girl);
          break;
        case 'evening':
          await sendEveningPush(bot, pair, guy, girl);
          break;
        case 'challenge':
          await sendWeeklyChallenge(bot, pair, guy, girl);
          break;
        case 'translator':
          await sendTranslator(bot, pair, guy, girl);
          break;
      }
    } catch (err) {
      console.error(`Error sending push to pair ${pair.id}:`, err);
    }
  }
}

async function sendMorningPush(bot, pair, guy, girl) {
  const context = await buildDailyContext(pair, guy, girl);
  const contentKey = selectDailyContent(context);

  // Girl check-in
  if (girl) {
    const cycleCtx = girl.cycle ? getCycleContext(girl.cycle) : null;
    let greeting = `Доброе утро, ${girl.firstName}! 🌸`;
    if (cycleCtx) {
      const phaseGreetings = {
        MENSTRUATION: '\nСегодня береги себя 🤍',
        PMS: '\nБудь мягче к себе сегодня 🌙',
        PMS_PEAK: '\nТы сильная, даже когда не чувствуешь себя такой 💪',
        OVULATION: '\nТвоя энергия сегодня на максимуме ✨',
        FOLLICULAR: '\nОтличный день для новых начинаний ☀️',
      };
      greeting += phaseGreetings[cycleCtx.phase] || '';
    }

    await bot.api.sendMessage(
      girl.telegramId.toString(),
      greeting + '\n\nКак ты сегодня?',
      { reply_markup: girlMoodKeyboard }
    ).catch(() => {});
  }

  // Guy check-in
  if (guy) {
    const cycleCtx = girl?.cycle ? getCycleContext(girl.cycle) : null;
    let alertLine = '';
    if (cycleCtx?.alert) {
      const guyMsg = getGuyMessage(contentKey);
      if (guyMsg?.alert) {
        const alertTexts = {
          ALERT_PMS_APPROACH: '⛈ Приближается чувствительная фаза',
          ALERT_PMS_PEAK: '⚠️ Режим максимальной доброты',
          ALERT_PERIOD_START: '🩹 У неё первый день',
          ALERT_OVULATION: '📈 Её энергия на максимуме',
          ALERT_FOLLICULAR: '☀️ Она в отличном настроении',
          ALERT_LUTEAL_STABLE: '🌤 Всё стабильно',
        };
        alertLine = (alertTexts[cycleCtx.alert] || '') + '\n\n';
      }
    }

    await bot.api.sendMessage(
      guy.telegramId.toString(),
      `${alertLine}Как ты, ${guy.firstName}?`,
      { reply_markup: guyMoodKeyboard }
    ).catch(() => {});
  }
}

async function sendMiddayPush(bot, pair, guy, girl) {
  const context = await buildDailyContext(pair, guy, girl);
  const contentKey = selectDailyContent(context);

  // Send content-based tip
  if (guy) {
    const msg = getGuyMessage(contentKey);
    if (msg) {
      await bot.api.sendMessage(guy.telegramId.toString(), `💡 *Совет дня*\n\n${msg.text}`, {
        parse_mode: 'Markdown',
      }).catch(() => {});
    }
  }

  if (girl) {
    const msg = getGirlMessage(contentKey);
    if (msg) {
      await bot.api.sendMessage(girl.telegramId.toString(), `💡 *Совет дня*\n\n${msg.text}`, {
        parse_mode: 'Markdown',
      }).catch(() => {});
    }
  }
}

async function sendEveningPush(bot, pair, guy, girl) {
  // Every 5-7 days send relay question
  if (pair.dayCount % 5 === 0 && pair.dayCount > 0) {
    const relayKey = getNextRelayKey(pair.dayCount);
    const question = RELAY_QUESTIONS[relayKey];

    // Create queue entry
    await prisma.relayQueue.create({
      data: { pairId: pair.id, questionKey: relayKey },
    });

    // Send to appropriate user(s)
    if (question.targetGender === 'BOTH' || question.targetGender === 'MALE') {
      if (guy) await sendRelayQuestion(bot, guy, relayKey);
    }
    if (question.targetGender === 'BOTH' || question.targetGender === 'FEMALE') {
      if (girl) await sendRelayQuestion(bot, girl, relayKey);
    }
  }
}

async function sendWeeklyChallenge(bot, pair, guy, girl) {
  // Expire active challenges
  await prisma.pairChallenge.updateMany({
    where: { pairId: pair.id, status: 'ACTIVE' },
    data: { status: 'EXPIRED' },
  });

  const weekIndex = Math.floor(pair.dayCount / 7);
  const challenge = getChallengeForWeek(weekIndex);

  // Create new challenge
  const created = await prisma.pairChallenge.create({
    data: { pairId: pair.id, challengeKey: challenge.key },
  });

  const kb = new InlineKeyboard().text('✅ Сделано!', `challenge_done:${created.id}`);

  if (guy) {
    await bot.api.sendMessage(
      guy.telegramId.toString(),
      `🎯 *Челлендж недели*\n\n${challenge.guy}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    ).catch(() => {});
  }

  if (girl) {
    await bot.api.sendMessage(
      girl.telegramId.toString(),
      `🎯 *Челлендж недели*\n\n${challenge.girl}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    ).catch(() => {});
  }
}

async function sendTranslator(bot, pair, guy, girl) {
  const weekIndex = Math.floor(pair.dayCount / 7);
  const { guy: guyEntry, girl: girlEntry } = getTranslatorForWeek(weekIndex);

  if (guy) {
    await bot.api.sendMessage(
      guy.telegramId.toString(),
      `🔄 *Переводчик с женского*\n\n${guyEntry.original}\n\n💡 ${guyEntry.translation}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  if (girl) {
    await bot.api.sendMessage(
      girl.telegramId.toString(),
      `🔄 *Переводчик с мужского*\n\n${girlEntry.original}\n\n💡 ${girlEntry.translation}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

module.exports = { sendDailyPush };
