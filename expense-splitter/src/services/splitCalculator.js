/**
 * Calculate split amounts based on split type and parameters.
 *
 * @param {number} totalAmount - Total expense amount
 * @param {Array} participants - Array of { userId }
 * @param {string} splitType - 'equal' | 'exact' | 'percent' | 'shares' | 'adjustment'
 * @param {Object} splitData - Additional data for non-equal splits
 * @returns {Array} Array of { userId, amount, shareValue?, percentage? }
 */
function calculateSplits(totalAmount, participants, splitType, splitData = {}) {
  switch (splitType) {
    case 'equal':
      return splitEqual(totalAmount, participants);
    case 'exact':
      return splitExact(totalAmount, participants, splitData);
    case 'percent':
      return splitPercent(totalAmount, participants, splitData);
    case 'shares':
      return splitShares(totalAmount, participants, splitData);
    case 'adjustment':
      return splitAdjustment(totalAmount, participants, splitData);
    default:
      return splitEqual(totalAmount, participants);
  }
}

function splitEqual(totalAmount, participants) {
  const count = participants.length;
  const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - baseAmount * count) * 100) / 100;

  return participants.map((p, i) => ({
    userId: p.userId,
    amount: i === 0 ? baseAmount + remainder : baseAmount,
  }));
}

function splitExact(totalAmount, participants, splitData) {
  // splitData.amounts = { userId: amount }
  const amounts = splitData.amounts || {};

  return participants.map(p => ({
    userId: p.userId,
    amount: amounts[p.userId] || 0,
  }));
}

function splitPercent(totalAmount, participants, splitData) {
  // splitData.percentages = { userId: percentage }
  const percentages = splitData.percentages || {};

  return participants.map(p => {
    const pct = percentages[p.userId] || 0;
    return {
      userId: p.userId,
      amount: Math.round((totalAmount * pct / 100) * 100) / 100,
      percentage: pct,
    };
  });
}

function splitShares(totalAmount, participants, splitData) {
  // splitData.shares = { userId: numberOfShares }
  const shares = splitData.shares || {};
  const totalShares = Object.values(shares).reduce((s, v) => s + v, 0) || participants.length;

  return participants.map(p => {
    const userShares = shares[p.userId] || 1;
    return {
      userId: p.userId,
      amount: Math.round((totalAmount * userShares / totalShares) * 100) / 100,
      shareValue: userShares,
    };
  });
}

function splitAdjustment(totalAmount, participants, splitData) {
  // splitData.adjustments = { userId: +/- adjustment }
  const adjustments = splitData.adjustments || {};

  const totalAdjustments = Object.values(adjustments).reduce((s, v) => s + v, 0);
  const remainingAmount = totalAmount - totalAdjustments;
  const adjustedCount = participants.filter(p => !adjustments[p.userId]).length;
  const baseEach = adjustedCount > 0 ? remainingAmount / adjustedCount : 0;

  return participants.map(p => {
    const adj = adjustments[p.userId] || 0;
    const amount = adj !== 0 ? adj : baseEach;
    return {
      userId: p.userId,
      amount: Math.round(amount * 100) / 100,
    };
  });
}

/**
 * Validate that splits sum up to the total amount.
 */
function validateSplits(splits, totalAmount) {
  const sum = splits.reduce((s, sp) => s + sp.amount, 0);
  return Math.abs(sum - totalAmount) < 0.02; // Allow 2 cent rounding
}

module.exports = { calculateSplits, validateSplits };
