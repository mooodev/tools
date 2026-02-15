const path = require("path");

module.exports = {
  // pump.fun frontend API
  FRONTEND_API: "https://frontend-api-v3.pump.fun",
  ADVANCED_API: "https://advanced-api-v2.pump.fun",

  // PumpPortal WebSocket (free, no auth)
  PUMPPORTAL_WS: "wss://pumpportal.fun/api/data",

  // Rate limiting
  REQUEST_DELAY_MS: 3000, // delay between API calls to avoid rate limits
  RETRY_ATTEMPTS: 4,
  RETRY_BASE_DELAY_MS: 2000,

  // Pagination
  COINS_PER_PAGE: 50,
  TRADES_PER_PAGE: 200,
  MAX_TRADE_PAGES: 50, // max pages of trades to fetch per token (50 * 200 = 10,000 trades)

  // Storage
  DATA_DIR: path.join(__dirname, "..", "data"),
  TOKENS_DIR: path.join(__dirname, "..", "data", "tokens"),
  STATE_FILE: path.join(__dirname, "..", "data", "state.json"),

  // Optional JWT token for pump.fun API (set via env var)
  // Obtain by inspecting pump.fun network requests in browser devtools
  JWT_TOKEN: process.env.PUMPFUN_JWT || "",
};
