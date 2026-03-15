const { differenceInDays } = require('date-fns');

/**
 * Returns cycle context for a given cycle record.
 * @param {Object} cycle - Prisma Cycle model instance
 * @returns {Object} { phase, dayOfCycle, daysUntilNextPeriod, daysUntilOvulation, alert }
 */
function getCycleContext(cycle) {
  if (!cycle || cycle.isIrregular) {
    return {
      phase: 'UNKNOWN',
      dayOfCycle: 0,
      daysUntilNextPeriod: null,
      daysUntilOvulation: null,
      alert: null,
    };
  }

  const today = new Date();
  const lastPeriod = new Date(cycle.lastPeriodStart);
  const rawDays = differenceInDays(today, lastPeriod);

  // Normalize to current cycle position
  const dayOfCycle = (rawDays % cycle.cycleLength) + 1;

  const ovulationCenter = Math.floor(cycle.cycleLength / 2);
  const ovulationStart = ovulationCenter - 2;
  const ovulationEnd = ovulationCenter + 2;
  const pmsStart = cycle.cycleLength - 5;
  const pmsPeakStart = cycle.cycleLength - 2;

  let phase;
  let alert = null;

  if (dayOfCycle >= 1 && dayOfCycle <= cycle.periodLength) {
    phase = 'MENSTRUATION';
    if (dayOfCycle === 1) alert = 'ALERT_PERIOD_START';
  } else if (dayOfCycle > cycle.periodLength && dayOfCycle < ovulationStart) {
    phase = 'FOLLICULAR';
    alert = 'ALERT_FOLLICULAR';
  } else if (dayOfCycle >= ovulationStart && dayOfCycle <= ovulationEnd) {
    phase = 'OVULATION';
    alert = 'ALERT_OVULATION';
  } else if (dayOfCycle > ovulationEnd && dayOfCycle < pmsStart) {
    phase = 'LUTEAL_EARLY';
    alert = 'ALERT_LUTEAL_STABLE';
  } else if (dayOfCycle >= pmsStart && dayOfCycle < pmsPeakStart) {
    phase = 'PMS';
    alert = 'ALERT_PMS_APPROACH';
  } else {
    phase = 'PMS_PEAK';
    alert = 'ALERT_PMS_PEAK';
  }

  const daysUntilNextPeriod = cycle.cycleLength - dayOfCycle;
  const daysUntilOvulation = dayOfCycle < ovulationCenter
    ? ovulationCenter - dayOfCycle
    : ovulationCenter + cycle.cycleLength - dayOfCycle;

  return {
    phase,
    dayOfCycle,
    daysUntilNextPeriod,
    daysUntilOvulation,
    alert,
  };
}

module.exports = { getCycleContext };
