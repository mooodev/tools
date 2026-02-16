const path = require("path");

module.exports = {
  // pump.fun frontend API (for fetching graduated token listings)
  FRONTEND_API: "https://frontend-api-v3.pump.fun",

  // GeckoTerminal API (free, no key needed — for candlestick/OHLCV data)
  GECKO_API: "https://api.geckoterminal.com/api/v2",
  GECKO_NETWORK: "solana",
  GECKO_LIMIT: 1000, // max candles per request
  GECKO_RATE_LIMIT_MS: 1200, // ~50 req/min on free tier

  // pump.fun rate limiting
  REQUEST_DELAY_MS: 3000,
  RETRY_ATTEMPTS: 4,
  RETRY_BASE_DELAY_MS: 2000,

  // Pagination
  COINS_PER_PAGE: 50,

  // Candle fetching defaults
  DEFAULT_TIMEFRAME: "hour",
  DEFAULT_AGGREGATE: "1",
  DEFAULT_CURRENCY: "usd",

  // Storage
  DATA_DIR: path.join(__dirname, "..", "data"),
  TOKENS_DIR: path.join(__dirname, "..", "data", "tokens"),
  CANDLES_DIR: path.join(__dirname, "..", "data", "candles"),
  STATE_FILE: path.join(__dirname, "..", "data", "state.json"),
};
