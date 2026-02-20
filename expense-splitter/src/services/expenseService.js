const { getDb } = require('../db/database');

function createExpense({
  groupId, description, totalAmount, currency, categoryId,
  splitType, createdBy, payers, splits, note, receiptPhoto, date,
}) {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO expenses (group_id, description, total_amount, currency, category_id,
      split_type, created_by, note, receipt_photo, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId, description, totalAmount, currency || 'RUB',
    categoryId || null, splitType, createdBy, note || null,
    receiptPhoto || null, date || new Date().toISOString().split('T')[0]
  );

  const expenseId = result.lastInsertRowid;

  // Insert payers
  const insertPayer = db.prepare(
    'INSERT INTO expense_payers (expense_id, user_id, amount) VALUES (?, ?, ?)'
  );
  for (const p of payers) {
    insertPayer.run(expenseId, p.userId, p.amount);
  }

  // Insert splits
  const insertSplit = db.prepare(
    'INSERT INTO expense_splits (expense_id, user_id, amount, share_value, percentage) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of splits) {
    insertSplit.run(expenseId, s.userId, s.amount, s.shareValue || null, s.percentage || null);
  }

  // Update group timestamp
  db.prepare('UPDATE groups_ SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(groupId);

  return getExpenseById(expenseId);
}

function createSettlement({ groupId, fromUserId, toUserId, amount, currency, method, note }) {
  const db = getDb();

  db.prepare(`
    INSERT INTO settlements (group_id, from_user_id, to_user_id, amount, currency, method, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, fromUserId, toUserId, amount, currency || 'RUB', method || 'cash', note || null);

  // Also create an expense record marked as settlement
  const result = db.prepare(`
    INSERT INTO expenses (group_id, description, total_amount, currency, split_type,
      created_by, is_settlement)
    VALUES (?, 'Settlement', ?, ?, 'exact', ?, 1)
  `).run(groupId, amount, currency || 'RUB', fromUserId);

  const expenseId = result.lastInsertRowid;

  db.prepare('INSERT INTO expense_payers (expense_id, user_id, amount) VALUES (?, ?, ?)')
    .run(expenseId, fromUserId, amount);
  db.prepare('INSERT INTO expense_splits (expense_id, user_id, amount) VALUES (?, ?, ?)')
    .run(expenseId, toUserId, amount);

  db.prepare('UPDATE groups_ SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(groupId);

  return { expenseId };
}

function getExpenseById(id) {
  const db = getDb();
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!expense) return null;

  expense.payers = db.prepare(`
    SELECT ep.*, u.first_name, u.last_name, u.username, u.telegram_id
    FROM expense_payers ep JOIN users u ON ep.user_id = u.id
    WHERE ep.expense_id = ?
  `).all(id);

  expense.splits = db.prepare(`
    SELECT es.*, u.first_name, u.last_name, u.username, u.telegram_id
    FROM expense_splits es JOIN users u ON es.user_id = u.id
    WHERE es.expense_id = ?
  `).all(id);

  return expense;
}

function getGroupExpenses(groupId, limit = 50, offset = 0) {
  const db = getDb();
  return db.prepare(`
    SELECT e.*, c.icon as category_icon, c.key as category_key
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.group_id = ?
    ORDER BY e.date DESC, e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(groupId, limit, offset);
}

function getGroupExpenseCount(groupId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM expenses WHERE group_id = ?').get(groupId).count;
}

function deleteExpense(id) {
  const db = getDb();
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
}

function addComment(expenseId, userId, text) {
  const db = getDb();
  db.prepare('INSERT INTO expense_comments (expense_id, user_id, text) VALUES (?, ?, ?)')
    .run(expenseId, userId, text);
}

function getComments(expenseId) {
  const db = getDb();
  return db.prepare(`
    SELECT ec.*, u.first_name, u.last_name, u.username
    FROM expense_comments ec JOIN users u ON ec.user_id = u.id
    WHERE ec.expense_id = ?
    ORDER BY ec.created_at ASC
  `).all(expenseId);
}

function createFriendExpense({ userId, friendId, description, amount, currency, paidBy, categoryId, note }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO friend_expenses (user_id, friend_id, description, amount, currency, paid_by, category_id, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, friendId, description, amount, currency || 'RUB', paidBy, categoryId || null, note || null);
}

function getFriendExpenses(userId, friendId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM friend_expenses
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    ORDER BY date DESC, created_at DESC
  `).all(userId, friendId, friendId, userId);
}

function getCategories() {
  const db = getDb();
  return db.prepare('SELECT * FROM categories ORDER BY id').all();
}

function getUserExpensesForExport(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT e.*, g.name as group_name, c.key as category_key,
      c.name_en as category_en, c.name_ru as category_ru
    FROM expenses e
    JOIN groups_ g ON e.group_id = g.id
    JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.is_settlement = 0
    ORDER BY e.date DESC
  `).all(userId);
}

module.exports = {
  createExpense,
  createSettlement,
  getExpenseById,
  getGroupExpenses,
  getGroupExpenseCount,
  deleteExpense,
  addComment,
  getComments,
  createFriendExpense,
  getFriendExpenses,
  getCategories,
  getUserExpensesForExport,
};
