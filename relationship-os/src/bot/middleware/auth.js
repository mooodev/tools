const prisma = require('../../db/prisma');

async function authMiddleware(ctx, next) {
  if (!ctx.from) return;

  // Find or soft-cache user in session
  if (!ctx.session.userId) {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
      include: { pair: true, cycle: true },
    });

    if (user) {
      ctx.session.userId = user.id;
      ctx.session.gender = user.gender;
      ctx.session.pairId = user.pairId;
      ctx.session.onboardingDone = user.onboardingDone;
      ctx.session.onboardingStep = user.onboardingStep;
    }
  }

  ctx.dbUser = ctx.session.userId
    ? { id: ctx.session.userId, gender: ctx.session.gender, pairId: ctx.session.pairId }
    : null;

  await next();
}

module.exports = { authMiddleware };
