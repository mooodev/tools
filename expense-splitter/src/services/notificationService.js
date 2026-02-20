const { getDb } = require('../db/database');

let botInstance = null;

function setBotInstance(bot) {
  botInstance = bot;
}

function createNotification(userId, type, data) {
  const db = getDb();
  db.prepare('INSERT INTO notifications (user_id, type, data) VALUES (?, ?, ?)')
    .run(userId, type, JSON.stringify(data));
}

async function sendNotification(userId, message) {
  if (!botInstance) return;

  const db = getDb();
  const user = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(userId);
  if (!user) return;

  try {
    await botInstance.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
  } catch (err) {
    // User may have blocked the bot
    console.error(`Failed to send notification to user ${userId}:`, err.message);
  }
}

async function notifyGroupMembers(groupId, excludeUserId, message) {
  const db = getDb();
  const members = db.prepare(`
    SELECT u.id, u.telegram_id FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE gm.group_id = ? AND u.id != ?
  `).all(groupId, excludeUserId);

  for (const member of members) {
    await sendNotification(member.id, message);
  }
}

async function sendReminder(fromUserId, toUserId, amount, currency) {
  const db = getDb();
  const fromUser = db.prepare('SELECT * FROM users WHERE id = ?').get(fromUserId);
  const { t, getUserLang } = require('../i18n');
  const toUser = db.prepare('SELECT * FROM users WHERE id = ?').get(toUserId);
  if (!toUser) return;

  const lang = toUser.language || 'ru';
  const fromName = fromUser.first_name || fromUser.username || 'Someone';

  const message = t(lang, 'notif_reminder', { name: fromName, amount, currency });
  await sendNotification(toUserId, message);
}

function getUnreadNotifications(userId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 20'
  ).all(userId);
}

function markRead(userId) {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
}

module.exports = {
  setBotInstance,
  createNotification,
  sendNotification,
  notifyGroupMembers,
  sendReminder,
  getUnreadNotifications,
  markRead,
};
