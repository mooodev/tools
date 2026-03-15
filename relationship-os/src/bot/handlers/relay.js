const prisma = require('../../db/prisma');
const { InlineKeyboard } = require('grammy');
const { RELAY_QUESTIONS, getRelayDeliveryTemplate } = require('../../content/questions-relay');

function setupRelay(bot) {
  // User wants to answer relay question
  bot.callbackQuery(/^relay_answer:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const questionKey = ctx.match[1];
    ctx.session.state = 'AWAITING_FREE_TEXT';
    ctx.session.relayQuestionKey = questionKey;

    await ctx.reply('✍️ Напиши свой ответ:');
  });

  // Skip relay question
  bot.callbackQuery(/^relay_skip:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Пропущено');
    const questionKey = ctx.match[1];

    // Mark as skipped in queue
    if (ctx.dbUser?.pairId) {
      await prisma.relayQueue.updateMany({
        where: {
          pairId: ctx.dbUser.pairId,
          questionKey,
          answeredAt: null,
          expiredAt: null,
        },
        data: { expiredAt: new Date() },
      });
    }
  });

  // Handle free text for relay
  bot.on('message:text', async (ctx, next) => {
    if (ctx.session.state !== 'AWAITING_FREE_TEXT') return next();
    if (!ctx.session.relayQuestionKey) return next();

    const questionKey = ctx.session.relayQuestionKey;
    const text = ctx.message.text;

    // Save relay message
    const relay = await prisma.relayMessage.create({
      data: {
        fromUserId: ctx.dbUser.id,
        questionKey,
        text,
      },
    });

    // Update queue
    if (ctx.dbUser.pairId) {
      await prisma.relayQueue.updateMany({
        where: {
          pairId: ctx.dbUser.pairId,
          questionKey,
          answeredAt: null,
        },
        data: { answeredAt: new Date() },
      });

      // Award points
      await prisma.pair.update({
        where: { id: ctx.dbUser.pairId },
        data: { points: { increment: 20 } },
      });
    }

    // Deliver to partner
    const partner = await prisma.user.findFirst({
      where: { pairId: ctx.dbUser.pairId, id: { not: ctx.dbUser.id } },
    });

    if (partner) {
      const template = getRelayDeliveryTemplate(questionKey, ctx.dbUser.gender, text);
      await ctx.api.sendMessage(partner.telegramId.toString(), template).catch(() => {});

      await prisma.relayMessage.update({
        where: { id: relay.id },
        data: { delivered: true },
      });
    }

    // Reset state
    ctx.session.state = 'IDLE';
    ctx.session.relayQuestionKey = null;

    await ctx.reply('💌 Отправлено! Спасибо за открытость ❤️');
  });
}

// Send relay question to a user
async function sendRelayQuestion(bot, user, questionKey) {
  const question = RELAY_QUESTIONS[questionKey];
  if (!question) return;

  const text = user.gender === 'MALE' ? (question.textMale || question.text) : (question.textFemale || question.text);

  const kb = new InlineKeyboard()
    .text('✍️ Ответить', `relay_answer:${questionKey}`)
    .text('Пропустить', `relay_skip:${questionKey}`);

  await bot.api.sendMessage(user.telegramId.toString(), `💌 *Вопрос недели*\n\n${text}`, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

module.exports = { setupRelay, sendRelayQuestion };
