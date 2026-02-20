const { getDb } = require('../db/database');

/**
 * Calculate balances for a group.
 * Returns a map: { userId: netBalance }
 * Positive = owed money (creditor), Negative = owes money (debtor)
 */
function calculateGroupBalances(groupId) {
  const db = getDb();

  // Get all non-settlement expenses for this group
  const expenses = db.prepare(
    'SELECT id FROM expenses WHERE group_id = ? AND is_settlement = 0'
  ).all(groupId);

  const balances = {};

  for (const exp of expenses) {
    const payers = db.prepare(
      'SELECT user_id, amount FROM expense_payers WHERE expense_id = ?'
    ).all(exp.id);
    const splits = db.prepare(
      'SELECT user_id, amount FROM expense_splits WHERE expense_id = ?'
    ).all(exp.id);

    // Each payer gains credit (positive)
    for (const p of payers) {
      balances[p.user_id] = (balances[p.user_id] || 0) + p.amount;
    }
    // Each split participant gains debt (negative)
    for (const s of splits) {
      balances[s.user_id] = (balances[s.user_id] || 0) - s.amount;
    }
  }

  // Account for settlements
  const settlements = db.prepare(
    'SELECT from_user_id, to_user_id, amount FROM settlements WHERE group_id = ?'
  ).all(groupId);

  for (const s of settlements) {
    // from_user paid to_user, so from_user's balance goes up, to_user's goes down
    balances[s.from_user_id] = (balances[s.from_user_id] || 0) + s.amount;
    balances[s.to_user_id] = (balances[s.to_user_id] || 0) - s.amount;
  }

  return balances;
}

/**
 * Calculate pairwise debts in a group.
 * Returns array of { from, to, amount } objects.
 */
function calculatePairwiseDebts(groupId) {
  const balances = calculateGroupBalances(groupId);

  // Check if simplify_debts is enabled
  const db = getDb();
  const group = db.prepare('SELECT simplify_debts FROM groups_ WHERE id = ?').get(groupId);

  if (group && group.simplify_debts) {
    return simplifyDebts(balances);
  }

  return calculateDirectDebts(groupId);
}

/**
 * Calculate direct (unsimplified) debts from all expenses.
 */
function calculateDirectDebts(groupId) {
  const db = getDb();
  const debts = {}; // key: "fromId->toId", value: amount

  const expenses = db.prepare(
    'SELECT id FROM expenses WHERE group_id = ? AND is_settlement = 0'
  ).all(groupId);

  for (const exp of expenses) {
    const payers = db.prepare(
      'SELECT user_id, amount FROM expense_payers WHERE expense_id = ?'
    ).all(exp.id);
    const splits = db.prepare(
      'SELECT user_id, amount FROM expense_splits WHERE expense_id = ?'
    ).all(exp.id);

    const totalPaid = payers.reduce((s, p) => s + p.amount, 0);

    for (const split of splits) {
      for (const payer of payers) {
        if (split.user_id === payer.user_id) continue;
        const payerShare = payer.amount / totalPaid;
        const debtAmount = split.amount * payerShare;

        const key = `${split.user_id}->${payer.user_id}`;
        const reverseKey = `${payer.user_id}->${split.user_id}`;

        if (debts[reverseKey]) {
          debts[reverseKey] -= debtAmount;
          if (debts[reverseKey] < 0) {
            debts[key] = -debts[reverseKey];
            delete debts[reverseKey];
          } else if (debts[reverseKey] === 0) {
            delete debts[reverseKey];
          }
        } else {
          debts[key] = (debts[key] || 0) + debtAmount;
        }
      }
    }
  }

  // Account for settlements
  const settlements = db.prepare(
    'SELECT from_user_id, to_user_id, amount FROM settlements WHERE group_id = ?'
  ).all(groupId);

  for (const s of settlements) {
    const key = `${s.from_user_id}->${s.to_user_id}`;
    const reverseKey = `${s.to_user_id}->${s.from_user_id}`;

    if (debts[reverseKey]) {
      debts[reverseKey] -= s.amount;
      if (debts[reverseKey] < 0) {
        debts[key] = (debts[key] || 0) + (-debts[reverseKey]);
        delete debts[reverseKey];
      } else if (Math.abs(debts[reverseKey]) < 0.01) {
        delete debts[reverseKey];
      }
    } else {
      debts[key] = (debts[key] || 0) - s.amount;
      if (debts[key] <= 0) delete debts[key];
    }
  }

  const result = [];
  for (const [key, amount] of Object.entries(debts)) {
    if (amount > 0.01) {
      const [from, to] = key.split('->');
      result.push({ from: parseInt(from), to: parseInt(to), amount: Math.round(amount * 100) / 100 });
    }
  }
  return result;
}

/**
 * Simplify debts using a greedy algorithm.
 * Input: { userId: netBalance } where positive = creditor, negative = debtor
 * Output: array of { from, to, amount }
 */
function simplifyDebts(balances) {
  const debtors = []; // negative balance (they owe)
  const creditors = []; // positive balance (they are owed)

  for (const [userId, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ userId: parseInt(userId), amount: Math.abs(rounded) });
    } else if (rounded > 0.01) {
      creditors.push({ userId: parseInt(userId), amount: rounded });
    }
  }

  // Sort: largest debtor and largest creditor first (greedy)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const transferAmount = Math.min(debtor.amount, creditor.amount);
    const rounded = Math.round(transferAmount * 100) / 100;

    if (rounded > 0.01) {
      transactions.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: rounded,
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}

/**
 * Calculate total balance for a user across all groups.
 * Returns: { owes: [{userId, amount, currency}], owed: [{userId, amount, currency}] }
 */
function getUserTotalBalance(userId) {
  const db = getDb();
  const groups = db.prepare(`
    SELECT g.id, g.currency FROM groups_ g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
  `).all(userId);

  const netByUser = {}; // { otherUserId: { amount, currency } }

  for (const group of groups) {
    const debts = calculatePairwiseDebts(group.id);
    for (const d of debts) {
      if (d.from === userId) {
        const key = d.to;
        if (!netByUser[key]) netByUser[key] = 0;
        netByUser[key] -= d.amount;
      } else if (d.to === userId) {
        const key = d.from;
        if (!netByUser[key]) netByUser[key] = 0;
        netByUser[key] += d.amount;
      }
    }
  }

  // Also account for friend expenses
  const friendExpenses = db.prepare(`
    SELECT * FROM friend_expenses
    WHERE user_id = ? OR friend_id = ?
  `).all(userId, userId);

  for (const fe of friendExpenses) {
    const otherId = fe.user_id === userId ? fe.friend_id : fe.user_id;
    if (!netByUser[otherId]) netByUser[otherId] = 0;

    if (fe.paid_by === userId) {
      // Other person owes me half
      netByUser[otherId] += fe.amount / 2;
    } else {
      // I owe other person half
      netByUser[otherId] -= fe.amount / 2;
    }
  }

  const owes = [];
  const owed = [];

  for (const [otherUserId, amount] of Object.entries(netByUser)) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.01) {
      owed.push({ userId: parseInt(otherUserId), amount: rounded });
    } else if (rounded < -0.01) {
      owes.push({ userId: parseInt(otherUserId), amount: Math.abs(rounded) });
    }
  }

  return { owes, owed };
}

/**
 * Calculate what userId owes in a specific group.
 * Returns debts array relevant to userId.
 */
function getUserGroupDebts(groupId, userId) {
  const debts = calculatePairwiseDebts(groupId);
  const owes = debts.filter(d => d.from === userId);
  const owed = debts.filter(d => d.to === userId);
  return { owes, owed };
}

module.exports = {
  calculateGroupBalances,
  calculatePairwiseDebts,
  simplifyDebts,
  getUserTotalBalance,
  getUserGroupDebts,
};
