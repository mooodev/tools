const { stringify } = require('csv-stringify/sync');
const expenseService = require('./expenseService');
const userService = require('./userService');
const { getDb } = require('../db/database');

function exportUserExpensesToCSV(userId, lang = 'ru') {
  const expenses = expenseService.getUserExpensesForExport(userId);
  const db = getDb();

  const rows = expenses.map(exp => {
    const payers = db.prepare(`
      SELECT u.first_name, u.username, ep.amount
      FROM expense_payers ep JOIN users u ON ep.user_id = u.id
      WHERE ep.expense_id = ?
    `).all(exp.id);

    const splits = db.prepare(`
      SELECT u.first_name, u.username, es.amount
      FROM expense_splits es JOIN users u ON es.user_id = u.id
      WHERE es.expense_id = ?
    `).all(exp.id);

    const payerStr = payers.map(p => `${p.first_name || p.username}: ${p.amount}`).join('; ');
    const splitStr = splits.map(s => `${s.first_name || s.username}: ${s.amount}`).join('; ');

    return {
      date: exp.date,
      group: exp.group_name,
      description: exp.description,
      amount: exp.total_amount,
      currency: exp.currency,
      category: lang === 'ru' ? (exp.category_ru || '') : (exp.category_en || ''),
      split_type: exp.split_type,
      paid_by: payerStr,
      split_between: splitStr,
    };
  });

  const headers = lang === 'ru'
    ? ['Дата', 'Группа', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Тип деления', 'Оплатил', 'Разделено между']
    : ['Date', 'Group', 'Description', 'Amount', 'Currency', 'Category', 'Split Type', 'Paid By', 'Split Between'];

  return stringify(rows, {
    header: true,
    columns: [
      { key: 'date', header: headers[0] },
      { key: 'group', header: headers[1] },
      { key: 'description', header: headers[2] },
      { key: 'amount', header: headers[3] },
      { key: 'currency', header: headers[4] },
      { key: 'category', header: headers[5] },
      { key: 'split_type', header: headers[6] },
      { key: 'paid_by', header: headers[7] },
      { key: 'split_between', header: headers[8] },
    ],
    bom: true,
  });
}

module.exports = { exportUserExpensesToCSV };
