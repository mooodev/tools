const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

function createGroup(name, type, createdBy, currency = 'RUB') {
  const db = getDb();
  const inviteCode = uuidv4().slice(0, 8).toUpperCase();

  const result = db.prepare(`
    INSERT INTO groups_ (name, type, created_by, currency, invite_code)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, type, createdBy, currency, inviteCode);

  // Add creator as member with admin role
  db.prepare(`
    INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'admin')
  `).run(result.lastInsertRowid, createdBy);

  return getGroupById(result.lastInsertRowid);
}

function getGroupById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM groups_ WHERE id = ?').get(id);
}

function getGroupByInviteCode(code) {
  const db = getDb();
  return db.prepare('SELECT * FROM groups_ WHERE invite_code = ?').get(code.toUpperCase());
}

function getGroupByChatId(chatId) {
  const db = getDb();
  return db.prepare('SELECT * FROM groups_ WHERE telegram_chat_id = ?').get(String(chatId));
}

function getUserGroups(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT g.* FROM groups_ g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY g.updated_at DESC
  `).all(userId);
}

function getGroupMembers(groupId) {
  const db = getDb();
  return db.prepare(`
    SELECT u.*, gm.role FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at
  `).all(groupId);
}

function addMember(groupId, userId) {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);
  if (existing) return false;

  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
  return true;
}

function removeMember(groupId, userId) {
  const db = getDb();
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
}

function isMember(groupId, userId) {
  const db = getDb();
  return !!db.prepare(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);
}

function deleteGroup(groupId) {
  const db = getDb();
  db.prepare('DELETE FROM groups_ WHERE id = ?').run(groupId);
}

function updateGroupSettings(groupId, settings) {
  const db = getDb();
  const fields = [];
  const values = [];

  if ('simplify_debts' in settings) {
    fields.push('simplify_debts = ?');
    values.push(settings.simplify_debts ? 1 : 0);
  }
  if ('default_split_type' in settings) {
    fields.push('default_split_type = ?');
    values.push(settings.default_split_type);
  }
  if ('default_split_data' in settings) {
    fields.push('default_split_data = ?');
    values.push(JSON.stringify(settings.default_split_data));
  }
  if ('currency' in settings) {
    fields.push('currency = ?');
    values.push(settings.currency);
  }
  if ('name' in settings) {
    fields.push('name = ?');
    values.push(settings.name);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(groupId);

  db.prepare(`UPDATE groups_ SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function setGroupChatId(groupId, chatId) {
  const db = getDb();
  db.prepare('UPDATE groups_ SET telegram_chat_id = ? WHERE id = ?').run(String(chatId), groupId);
}

module.exports = {
  createGroup,
  getGroupById,
  getGroupByInviteCode,
  getGroupByChatId,
  getUserGroups,
  getGroupMembers,
  addMember,
  removeMember,
  isMember,
  deleteGroup,
  updateGroupSettings,
  setGroupChatId,
};
