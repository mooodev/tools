const { getCycleContext } = require('./cycle');
const { getStressContext } = require('./stress');

// Weekly content rotation for normal days
const WEEKLY_CONTENT_MAP = [
  'CONTENT_GENERIC_DAY_1',
  'CONTENT_GENERIC_DAY_2',
  'CONTENT_GENERIC_DAY_3',
  'CONTENT_GENERIC_DAY_4',
  'CONTENT_GENERIC_DAY_5',
  'CONTENT_GENERIC_DAY_6',
  'CONTENT_GENERIC_DAY_7',
];

/**
 * Select daily content key based on context.
 * @param {Object} context
 * @returns {string} content key
 */
function selectDailyContent(context) {
  const {
    cycleContext,
    dayCount,
    guyStress,
    girlMood,
    guyAttachment,
    girlAttachment,
    bothHighStress,
    guyConsecutiveHigh,
  } = context;

  const phase = cycleContext?.phase;

  // Priority 1 — both stressed
  if (bothHighStress) return 'CONTENT_BOTH_STRESSED';

  // Priority 2 — critical cycle alerts
  if (phase === 'PMS_PEAK') return 'CONTENT_PMS_PEAK';
  if (phase === 'MENSTRUATION' && cycleContext.dayOfCycle === 1) return 'CONTENT_PERIOD_DAY1';
  if (phase === 'OVULATION') return 'CONTENT_OVULATION';
  if (phase === 'PMS') return 'CONTENT_PMS_APPROACH';

  // Priority 3 — stress
  if (guyStress >= 4) {
    if (guyConsecutiveHigh >= 3) return 'CONTENT_GUY_HIGH_STRESS_PROLONGED';
    return 'CONTENT_GUY_HIGH_STRESS';
  }
  if (girlMood <= 2) return 'CONTENT_GIRL_LOW_MOOD';

  // Priority 4 — cycle-based normal content
  if (phase === 'FOLLICULAR') return 'CONTENT_FOLLICULAR';
  if (phase === 'LUTEAL_EARLY') return 'CONTENT_LUTEAL_STABLE';

  // Priority 5 — attachment tips (weekly)
  if (dayCount % 7 === 0 && dayCount > 0) {
    return 'CONTENT_TRANSLATOR_WEEKLY';
  }

  // Priority 6 — day rotation
  const weekIndex = dayCount % WEEKLY_CONTENT_MAP.length;
  return WEEKLY_CONTENT_MAP[weekIndex];
}

/**
 * Build full context for a pair.
 */
async function buildDailyContext(pair, guy, girl) {
  const cycleContext = girl?.cycle ? getCycleContext(girl.cycle) : null;
  const guyStressCtx = guy ? await getStressContext(guy.id) : { currentLevel: 3, consecutiveHighDays: 0, bothHighStress: false };

  // Get girl's latest mood from today's log
  let girlMood = 3;
  if (girl) {
    const prisma = require('../db/prisma');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const log = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId: girl.id, date: today } },
    });
    if (log?.mood) girlMood = log.mood;
  }

  return {
    cycleContext,
    dayCount: pair.dayCount,
    guyStress: guyStressCtx.currentLevel,
    girlMood,
    guyAttachment: guy?.attachmentType,
    girlAttachment: girl?.attachmentType,
    bothHighStress: guyStressCtx.bothHighStress,
    guyConsecutiveHigh: guyStressCtx.consecutiveHighDays,
  };
}

module.exports = { selectDailyContent, buildDailyContext };
