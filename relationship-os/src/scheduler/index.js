const cron = require('node-cron');
const { sendDailyPush } = require('./daily-push');
const { checkCycleUpdates } = require('./cycle-check');
const { incrementDayCounts } = require('../logic/pair');

function startScheduler(bot) {
  console.log('Scheduler started');

  // 09:00 — Morning check-in for all active pairs
  cron.schedule('0 9 * * *', () => {
    console.log('[cron] Daily morning push');
    sendDailyPush(bot, 'morning').catch(console.error);
  });

  // 13:00 — Midday tip (certain days only)
  cron.schedule('0 13 * * 1,3,5', () => {
    console.log('[cron] Midday tip');
    sendDailyPush(bot, 'midday').catch(console.error);
  });

  // 20:00 — Evening relay question or retrospective
  cron.schedule('0 20 * * *', () => {
    console.log('[cron] Evening push');
    sendDailyPush(bot, 'evening').catch(console.error);
  });

  // 21:30 Sunday — Weekly challenge
  cron.schedule('30 21 * * 0', () => {
    console.log('[cron] Weekly challenge');
    sendDailyPush(bot, 'challenge').catch(console.error);
  });

  // 11:00 Monday — Translator of the week
  cron.schedule('0 11 * * 1', () => {
    console.log('[cron] Weekly translator');
    sendDailyPush(bot, 'translator').catch(console.error);
  });

  // 10:00 1st of month — Cycle update reminder for girls
  cron.schedule('0 10 1 * *', () => {
    console.log('[cron] Monthly cycle update');
    checkCycleUpdates(bot).catch(console.error);
  });

  // 00:05 — Increment pair day counts
  cron.schedule('5 0 * * *', () => {
    console.log('[cron] Increment day counts');
    incrementDayCounts().catch(console.error);
  });
}

module.exports = { startScheduler };
