const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { getDb } = require('../db/database');
const userService = require('../services/userService');
const groupService = require('../services/groupService');
const expenseService = require('../services/expenseService');
const balanceService = require('../services/balanceService');
const exportService = require('../services/exportService');
const { calculateSplits } = require('../services/splitCalculator');
const { t } = require('../i18n');

function createServer(port) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Upload config
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE) || 10) * 1024 * 1024 },
  });

  app.use('/uploads', express.static(uploadDir));

  // ===== API ROUTES =====

  // Get or create user by telegram ID
  app.get('/api/user/:telegramId', (req, res) => {
    const user = userService.getUser(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  // Set language
  app.post('/api/user/:telegramId/language', (req, res) => {
    const { language } = req.body;
    userService.setLanguage(req.params.telegramId, language);
    res.json({ success: true });
  });

  // Get user groups
  app.get('/api/user/:telegramId/groups', (req, res) => {
    const user = userService.getUser(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const groups = groupService.getUserGroups(user.id);
    res.json(groups);
  });

  // Get user total balance
  app.get('/api/user/:telegramId/balance', (req, res) => {
    const user = userService.getUser(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const balance = balanceService.getUserTotalBalance(user.id);

    // Resolve user names
    const resolveNames = (list) => list.map(d => ({
      ...d,
      name: userService.getDisplayName(userService.getUserById(d.userId)),
    }));

    res.json({
      owes: resolveNames(balance.owes),
      owed: resolveNames(balance.owed),
    });
  });

  // Create group
  app.post('/api/groups', (req, res) => {
    const { telegramId, name, type, currency } = req.body;
    const user = userService.getUser(telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const group = groupService.createGroup(name, type || 'other', user.id, currency || 'RUB');
    res.json(group);
  });

  // Get group details
  app.get('/api/groups/:id', (req, res) => {
    const group = groupService.getGroupById(parseInt(req.params.id));
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = groupService.getGroupMembers(group.id);
    const debts = balanceService.calculatePairwiseDebts(group.id);

    const resolvedDebts = debts.map(d => ({
      ...d,
      fromName: userService.getDisplayName(userService.getUserById(d.from)),
      toName: userService.getDisplayName(userService.getUserById(d.to)),
    }));

    res.json({ ...group, members, debts: resolvedDebts });
  });

  // Get group members
  app.get('/api/groups/:id/members', (req, res) => {
    const members = groupService.getGroupMembers(parseInt(req.params.id));
    res.json(members);
  });

  // Join group by invite code
  app.post('/api/groups/join', (req, res) => {
    const { telegramId, inviteCode } = req.body;
    const user = userService.getUser(telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const group = groupService.getGroupByInviteCode(inviteCode);
    if (!group) return res.status(404).json({ error: 'Invalid invite code' });

    if (groupService.isMember(group.id, user.id)) {
      return res.json({ success: true, group, alreadyMember: true });
    }

    groupService.addMember(group.id, user.id);
    res.json({ success: true, group });
  });

  // Update group settings
  app.put('/api/groups/:id/settings', (req, res) => {
    groupService.updateGroupSettings(parseInt(req.params.id), req.body);
    res.json({ success: true });
  });

  // Delete group
  app.delete('/api/groups/:id', (req, res) => {
    groupService.deleteGroup(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Get group expenses
  app.get('/api/groups/:id/expenses', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const expenses = expenseService.getGroupExpenses(parseInt(req.params.id), limit, offset);
    const total = expenseService.getGroupExpenseCount(parseInt(req.params.id));
    res.json({ expenses, total });
  });

  // Get group balance
  app.get('/api/groups/:id/balance', (req, res) => {
    const groupId = parseInt(req.params.id);
    const balances = balanceService.calculateGroupBalances(groupId);
    const debts = balanceService.calculatePairwiseDebts(groupId);

    const resolvedBalances = {};
    for (const [uid, bal] of Object.entries(balances)) {
      const user = userService.getUserById(parseInt(uid));
      resolvedBalances[uid] = {
        userId: parseInt(uid),
        name: userService.getDisplayName(user),
        balance: Math.round(bal * 100) / 100,
      };
    }

    const resolvedDebts = debts.map(d => ({
      ...d,
      fromName: userService.getDisplayName(userService.getUserById(d.from)),
      toName: userService.getDisplayName(userService.getUserById(d.to)),
    }));

    res.json({ balances: Object.values(resolvedBalances), debts: resolvedDebts });
  });

  // Add expense
  app.post('/api/expenses', (req, res) => {
    const {
      telegramId, groupId, description, amount, currency, categoryId,
      splitType, payerIds, splitData, note,
    } = req.body;

    const user = userService.getUser(telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const group = groupService.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = groupService.getGroupMembers(groupId);
    const participants = members.map(m => ({ userId: m.id }));

    // Calculate payers
    let payers;
    if (payerIds && Array.isArray(payerIds)) {
      const perPayer = amount / payerIds.length;
      payers = payerIds.map(id => ({ userId: id, amount: perPayer }));
    } else {
      payers = [{ userId: user.id, amount }];
    }

    // Calculate splits
    const splits = calculateSplits(amount, participants, splitType || 'equal', splitData || {});

    const expense = expenseService.createExpense({
      groupId,
      description,
      totalAmount: amount,
      currency: currency || group.currency,
      categoryId: categoryId || null,
      splitType: splitType || 'equal',
      createdBy: user.id,
      payers,
      splits,
      note,
    });

    res.json(expense);
  });

  // Get expense detail
  app.get('/api/expenses/:id', (req, res) => {
    const expense = expenseService.getExpenseById(parseInt(req.params.id));
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    const comments = expenseService.getComments(expense.id);
    res.json({ ...expense, comments });
  });

  // Delete expense
  app.delete('/api/expenses/:id', (req, res) => {
    expenseService.deleteExpense(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Add comment to expense
  app.post('/api/expenses/:id/comments', (req, res) => {
    const { telegramId, text } = req.body;
    const user = userService.getUser(telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    expenseService.addComment(parseInt(req.params.id), user.id, text);
    res.json({ success: true });
  });

  // Create settlement
  app.post('/api/settlements', (req, res) => {
    const { telegramId, groupId, toUserId, amount, method } = req.body;
    const user = userService.getUser(telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const group = groupService.getGroupById(groupId);
    expenseService.createSettlement({
      groupId,
      fromUserId: user.id,
      toUserId,
      amount,
      currency: group ? group.currency : 'RUB',
      method: method || 'cash',
    });

    res.json({ success: true });
  });

  // Get categories
  app.get('/api/categories', (req, res) => {
    const categories = expenseService.getCategories();
    res.json(categories);
  });

  // Export CSV
  app.get('/api/export/:telegramId', (req, res) => {
    const user = userService.getUser(req.params.telegramId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const csv = exportService.exportUserExpensesToCSV(user.id, user.language);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(csv);
  });

  // Upload receipt
  app.post('/api/upload', upload.single('receipt'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ path: `/uploads/${req.file.filename}` });
  });

  // Serve main webapp
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = app.listen(port, () => {
    console.log(`Web server running on port ${port}`);
  });

  return server;
}

module.exports = { createServer };
