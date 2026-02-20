/**
 * Manages conversation state for multi-step bot interactions.
 * State is kept in memory (cleared on restart).
 */
const states = new Map();

function getState(chatId, userId) {
  return states.get(`${chatId}:${userId}`) || null;
}

function setState(chatId, userId, state) {
  states.set(`${chatId}:${userId}`, state);
}

function clearState(chatId, userId) {
  states.delete(`${chatId}:${userId}`);
}

function updateState(chatId, userId, updates) {
  const current = getState(chatId, userId) || {};
  setState(chatId, userId, { ...current, ...updates });
}

module.exports = { getState, setState, clearState, updateState };
