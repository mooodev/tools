const { getDb } = require('../db/database');
const expenseService = require('./expenseService');

function createRecurring({
  groupId, description, totalAmount, currency, categoryId,
  splitType, splitData, payerData, createdBy, frequency, startDate,
}) {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO recurring_expenses (group_id, description, total_amount, currency,
      category_id, split_type, split_data, payer_data, created_by, frequency, next_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId, description, totalAmount, currency || 'RUB',
    categoryId || null, splitType, JSON.stringify(splitData),
    JSON.stringify(payerData), createdBy, frequency, startDate
  );

  return result.lastInsertRowid;
}

function getActiveRecurring() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM recurring_expenses
    WHERE is_active = 1 AND next_date <= date('now')
  `).all();
}

function processRecurringExpenses() {
  const db = getDb();
  const dueExpenses = getActiveRecurring();
  const processed = [];

  for (const re of dueExpenses) {
    const payerData = JSON.parse(re.payer_data);
    const splitData = JSON.parse(re.split_data);

    const expense = expenseService.createExpense({
      groupId: re.group_id,
      description: re.description,
      totalAmount: re.total_amount,
      currency: re.currency,
      categoryId: re.category_id,
      splitType: re.split_type,
      createdBy: re.created_by,
      payers: payerData,
      splits: splitData,
    });

    // Update next_date
    const nextDate = calculateNextDate(re.next_date, re.frequency);
    db.prepare('UPDATE recurring_expenses SET next_date = ? WHERE id = ?')
      .run(nextDate, re.id);

    processed.push({ recurring: re, expense });
  }

  return processed;
}

function calculateNextDate(currentDate, frequency) {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
  return date.toISOString().split('T')[0];
}

function deactivateRecurring(id) {
  const db = getDb();
  db.prepare('UPDATE recurring_expenses SET is_active = 0 WHERE id = ?').run(id);
}

function getGroupRecurring(groupId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM recurring_expenses WHERE group_id = ? AND is_active = 1'
  ).all(groupId);
}

module.exports = {
  createRecurring,
  processRecurringExpenses,
  deactivateRecurring,
  getGroupRecurring,
};
