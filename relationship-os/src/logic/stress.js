const prisma = require('../db/prisma');
const { subDays } = require('date-fns');

/**
 * Analyze stress trends for a user.
 * @param {number} userId
 * @returns {Object} { currentLevel, trend, consecutiveHighDays, bothHighStress }
 */
async function getStressContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { pair: { include: { users: true } } },
  });

  if (!user) return { currentLevel: 3, trend: 'stable', consecutiveHighDays: 0, bothHighStress: false };

  // Get last 7 days of stress logs
  const logs = await prisma.stressLog.findMany({
    where: {
      userId,
      createdAt: { gte: subDays(new Date(), 7) },
    },
    orderBy: { createdAt: 'desc' },
    take: 7,
  });

  // Count consecutive high-stress days
  let consecutiveHighDays = 0;
  for (const log of logs) {
    if (log.level >= 4) consecutiveHighDays++;
    else break;
  }

  // Trend
  let trend = 'stable';
  if (logs.length >= 3) {
    const recent = logs.slice(0, 3).reduce((s, l) => s + l.level, 0) / 3;
    const older = logs.slice(-3).reduce((s, l) => s + l.level, 0) / Math.min(3, logs.length);
    if (recent - older > 0.5) trend = 'rising';
    else if (older - recent > 0.5) trend = 'falling';
  }

  // Check if both partners are stressed
  let bothHighStress = false;
  if (user.pair) {
    const partner = user.pair.users.find(u => u.id !== userId);
    if (partner && partner.stressLevel >= 4 && user.stressLevel >= 4) {
      bothHighStress = true;
    }
  }

  return {
    currentLevel: user.stressLevel,
    trend,
    consecutiveHighDays,
    bothHighStress,
  };
}

module.exports = { getStressContext };
