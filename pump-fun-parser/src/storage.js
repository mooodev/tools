const fs = require("fs");
const path = require("path");
const config = require("./config");

function initStorage() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.TOKENS_DIR, { recursive: true });
  fs.mkdirSync(config.CANDLES_DIR, { recursive: true });
}

function saveToken(tokenData) {
  const mint = tokenData.mint;
  if (!mint) return;

  const filename = `${sanitize(mint)}.json`;
  const filepath = path.join(config.TOKENS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(tokenData, null, 2), "utf8");
}

function saveCandles(mint, candleData) {
  if (!mint) return;

  const filename = `${sanitize(mint)}.json`;
  const filepath = path.join(config.CANDLES_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(candleData, null, 2), "utf8");
}

function tokenExists(mint) {
  const filename = `${sanitize(mint)}.json`;
  return fs.existsSync(path.join(config.TOKENS_DIR, filename));
}

function candlesExist(mint) {
  const filename = `${sanitize(mint)}.json`;
  return fs.existsSync(path.join(config.CANDLES_DIR, filename));
}

function saveState(state) {
  fs.writeFileSync(config.STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function loadState() {
  if (!fs.existsSync(config.STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(config.STATE_FILE, "utf8"));
}

function getTokenCount() {
  if (!fs.existsSync(config.TOKENS_DIR)) return 0;
  return fs.readdirSync(config.TOKENS_DIR).filter((f) => f.endsWith(".json")).length;
}

function getCandleCount() {
  if (!fs.existsSync(config.CANDLES_DIR)) return 0;
  return fs.readdirSync(config.CANDLES_DIR).filter((f) => f.endsWith(".json")).length;
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

module.exports = {
  initStorage,
  saveToken,
  saveCandles,
  tokenExists,
  candlesExist,
  saveState,
  loadState,
  getTokenCount,
  getCandleCount,
};
