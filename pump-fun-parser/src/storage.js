const fs = require("fs");
const path = require("path");
const config = require("./config");

/**
 * Ensure all data directories exist.
 */
function initStorage() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.TOKENS_DIR, { recursive: true });
}

/**
 * Save a token's full data to a JSON file.
 * Filename is the mint address (sanitized).
 * @param {object} tokenData
 */
function saveToken(tokenData) {
  const mint = tokenData.mint;
  if (!mint) return;

  const filename = `${sanitizeFilename(mint)}.json`;
  const filepath = path.join(config.TOKENS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(tokenData, null, 2), "utf8");
}

/**
 * Check if a token has already been saved.
 * @param {string} mint
 * @returns {boolean}
 */
function tokenExists(mint) {
  const filename = `${sanitizeFilename(mint)}.json`;
  const filepath = path.join(config.TOKENS_DIR, filename);
  return fs.existsSync(filepath);
}

/**
 * Load existing token data (for appending trades).
 * @param {string} mint
 * @returns {object|null}
 */
function loadToken(mint) {
  const filename = `${sanitizeFilename(mint)}.json`;
  const filepath = path.join(config.TOKENS_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

/**
 * Save/load crawler state for resumption.
 */
function saveState(state) {
  fs.writeFileSync(config.STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function loadState() {
  if (!fs.existsSync(config.STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(config.STATE_FILE, "utf8"));
}

/**
 * Get count of saved token files.
 */
function getTokenCount() {
  if (!fs.existsSync(config.TOKENS_DIR)) return 0;
  return fs.readdirSync(config.TOKENS_DIR).filter((f) => f.endsWith(".json")).length;
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

module.exports = {
  initStorage,
  saveToken,
  tokenExists,
  loadToken,
  saveState,
  loadState,
  getTokenCount,
};
