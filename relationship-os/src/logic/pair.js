const prisma = require('../db/prisma');
const { subDays } = require('date-fns');

/**
 * Get full pair context for content selection.
 */
async function getPairContext(pairId) {
  const pair = await prisma.pair.findUnique({
    where: { id: pairId },
    include: {
      users: { include: { cycle: true } },
    },
  });

  if (!pair) return null;

  const guy = pair.users.find(u => u.gender === 'MALE');
  const girl = pair.users.find(u => u.gender === 'FEMALE');

  // Activity check
  const threeDaysAgo = subDays(new Date(), 3);
  const guyActive = guy && guy.lastActiveAt >= threeDaysAgo;
  const girlActive = girl && girl.lastActiveAt >= threeDaysAgo;

  return {
    pair,
    guy,
    girl,
    guyActive,
    girlActive,
    dayCount: pair.dayCount,
    points: pair.points,
    level: pair.level,
  };
}

/**
 * Calculate pair level from points.
 */
function calculateLevel(points) {
  if (points >= 1000) return 5; // Легендарная пара
  if (points >= 500) return 4;  // Команда
  if (points >= 200) return 3;  // Доверие
  if (points >= 50) return 2;   // Связь
  return 1;                     // Знакомство
}

/**
 * Increment dayCount for all active pairs. Run daily.
 */
async function incrementDayCounts() {
  await prisma.pair.updateMany({
    where: { status: 'ACTIVE' },
    data: { dayCount: { increment: 1 } },
  });

  // Update levels
  const pairs = await prisma.pair.findMany({ where: { status: 'ACTIVE' } });
  for (const pair of pairs) {
    const newLevel = calculateLevel(pair.points);
    if (newLevel !== pair.level) {
      await prisma.pair.update({
        where: { id: pair.id },
        data: { level: newLevel },
      });
    }
  }

  // Milestone bonuses
  for (const pair of pairs) {
    if (pair.dayCount === 30) {
      await prisma.pair.update({
        where: { id: pair.id },
        data: { points: { increment: 100 } },
      });
    } else if (pair.dayCount === 90) {
      await prisma.pair.update({
        where: { id: pair.id },
        data: { points: { increment: 200 } },
      });
    }
  }
}

module.exports = { getPairContext, calculateLevel, incrementDayCounts };
