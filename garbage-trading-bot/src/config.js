// ── Garbage Trading Bot Configuration ──
// All settings are runtime-mutable via the dashboard config tab.

const config = {
  // ── APIs ──
  FRONTEND_API: 'https://frontend-api-v3.pump.fun',
  GECKO_API: 'https://api.geckoterminal.com/api/v2',
  GECKO_NETWORK: 'solana',

  // ── Rate Limiting ──
  REQUEST_DELAY_MS: 3000,
  GECKO_RATE_LIMIT_MS: 1200,
  RETRY_ATTEMPTS: 4,
  RETRY_BASE_DELAY_MS: 2000,

  // ── Scanning Filters ──
  TOKEN_FILTER: 'graduated',       // Token filter: "graduated", "all"
  MIN_DAILY_VOLUME_USD: 100_000,   // tokens must have >$100k 24h volume
  MAX_MARKET_CAP_USD: 2_000,       // tokens must have <$2k current mcap
  COINS_PER_PAGE: 50,
  MAX_PAGES_TO_SCAN: 20,           // max pages to scan per run
  SCAN_SORT: 'market_cap',
  SCAN_ORDER: 'ASC',               // ASC = lowest mcap first
  REQUIRE_IMAGE: false,             // skip tokens without a banner/logo image
  REQUIRE_TWITTER: false,           // skip tokens without a twitter link

  // ── Monitor ──
  PRICE_UPDATE_INTERVAL_MS: 3 * 60 * 1000,  // update prices every 3 minutes
  SCAN_INTERVAL_MS: 10 * 60 * 1000,         // scan for new tokens every 10 minutes
  MAX_MONITORED_TOKENS: 200,                 // cap the monitor list

  // ── Server ──
  PORT: 3002,
};

module.exports = config;
