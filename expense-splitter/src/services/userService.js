const { getDb } = require('../db/database');

function ensureUser(telegramUser) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramUser.id));

  if (existing) {
    db.prepare(`
      UPDATE users SET username = ?, first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).run(
      telegramUser.username || null,
      telegramUser.first_name || null,
      telegramUser.last_name || null,
      String(telegramUser.id)
    );
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramUser.id));
  }

  db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, last_name)
    VALUES (?, ?, ?, ?)
  `).run(
    String(telegramUser.id),
    telegramUser.username || null,
    telegramUser.first_name || null,
    telegramUser.last_name || null
  );

  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramUser.id));
}

function getUser(telegramId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
}

function getUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  const db = getDb();
  const clean = username.replace('@', '');
  return db.prepare('SELECT * FROM users WHERE username = ?').get(clean);
}

function setLanguage(telegramId, lang) {
  const db = getDb();
  db.prepare('UPDATE users SET language = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?')
    .run(lang, String(telegramId));
}

function setCurrency(telegramId, currency) {
  const db = getDb();
  db.prepare('UPDATE users SET currency = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?')
    .run(currency, String(telegramId));
}

function getDisplayName(user) {
  if (!user) return 'Unknown';
  if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
  if (user.first_name) return user.first_name;
  if (user.username) return `@${user.username}`;
  return `User#${user.telegram_id}`;
}

function getAllFriends(userId) {
  const db = getDb();
  // Friends are people who share groups or have direct expenses
  const friends = db.prepare(`
    SELECT DISTINCT u.* FROM users u
    WHERE u.id != ? AND (
      u.id IN (
        SELECT gm2.user_id FROM group_members gm1
        JOIN group_members gm2 ON gm1.group_id = gm2.group_id
        WHERE gm1.user_id = ? AND gm2.user_id != ?
      )
      OR u.id IN (
        SELECT friend_id FROM friend_expenses WHERE user_id = ?
        UNION
        SELECT user_id FROM friend_expenses WHERE friend_id = ?
      )
    )
  `).all(userId, userId, userId, userId, userId);
  return friends;
}

module.exports = {
  ensureUser,
  getUser,
  getUserById,
  getUserByUsername,
  setLanguage,
  setCurrency,
  getDisplayName,
  getAllFriends,
};
