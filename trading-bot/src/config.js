const path = require("path");

/**
 * Master configuration — all tuneable parameters in one place.
 * The dashboard can override these at runtime via the control API.
 */

const config = {
  // ─── APIs ─────────────────────────────────────────────────────────
  FRONTEND_API: "https://frontend-api-v3.pump.fun",
  GECKO_API: "https://api.geckoterminal.com/api/v2",
  GECKO_NETWORK: "solana",
  GECKO_LIMIT: 1000,
  GECKO_RATE_LIMIT_MS: 1200,
  REQUEST_DELAY_MS: 3000,
  RETRY_ATTEMPTS: 4,
  RETRY_BASE_DELAY_MS: 2000,
  COINS_PER_PAGE: 50,

  // ─── Data Fetching ────────────────────────────────────────────────
  FETCH_HOURS: 72,                    // Pull this many hours of data
  DEFAULT_TIMEFRAME: "minute",        // GeckoTerminal timeframe
  DEFAULT_AGGREGATE: "1",             // 1-minute candles (base resolution)
  DEFAULT_CURRENCY: "usd",
  MAX_TOKENS_TO_FETCH: 100,           // Top N graduated tokens to pull
  MIN_VOLUME_24H: 10000,              // Minimum 24h volume in USD

  // ─── Candle Timeframes (for aggregation) ──────────────────────────
  // The base fetch is 1m. We can re-aggregate to these for experiments.
  CANDLE_MINUTES: 1,                  // Primary analysis timeframe
  AVAILABLE_TIMEFRAMES: [1, 5, 15, 30, 60], // Minutes - switchable from dashboard

  // ─── Feature Engineering ──────────────────────────────────────────
  SMA_PERIODS: [3, 5, 10, 20],       // Scaled for 1m candles
  EMA_PERIODS: [3, 5, 12, 26],
  RSI_PERIOD: 14,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  BBANDS_PERIOD: 20,
  BBANDS_STD: 2,
  ATR_PERIOD: 14,
  STOCH_K_PERIOD: 14,
  STOCH_D_PERIOD: 3,
  CCI_PERIOD: 20,
  WILLIAMS_PERIOD: 14,
  ROC_PERIODS: [1, 2, 4, 8, 16],     // Multi-scale for 1m
  OBV_ENABLED: true,
  VWAP_ENABLED: true,

  // ─── LightGBM / ML ───────────────────────────────────────────────
  PREDICTION_HORIZON: 4,              // N candles ahead (4 x 1m = 4 minutes)
  GROWTH_THRESHOLD: 0.05,             // Binary: does it go up 5%+ in next hour?
  MIN_CANDLES: 60,                    // Minimum candles per token for training
  TRAIN_RATIO: 0.70,
  VAL_RATIO: 0.15,
  TEST_RATIO: 0.15,

  // LightGBM hyperparams (passed to Python)
  LGBM_NUM_LEAVES: 31,
  LGBM_MAX_DEPTH: -1,
  LGBM_LEARNING_RATE: 0.05,
  LGBM_N_ESTIMATORS: 500,
  LGBM_MIN_CHILD_SAMPLES: 20,
  LGBM_SUBSAMPLE: 0.8,
  LGBM_COLSAMPLE_BYTREE: 0.8,
  LGBM_REG_ALPHA: 0.1,
  LGBM_REG_LAMBDA: 0.1,
  LGBM_EARLY_STOPPING_ROUNDS: 50,
  LGBM_SCALE_POS_WEIGHT: 1.0,       // Auto-computed from class balance

  // ─── Pattern Decay / EMH ─────────────────────────────────────────
  DECAY_WINDOW_HOURS: 12,            // Rolling window for feature importance
  DECAY_MIN_WINDOWS: 3,              // Need at least 3 windows to compute decay
  ALPHA_DECAY_THRESHOLD: 0.3,        // Feature considered "traded out" if importance drops 30%+
  FRESHNESS_LOOKBACK_WINDOWS: 6,     // Compare last N windows for trend

  // ─── Paths ────────────────────────────────────────────────────────
  DATA_DIR: path.join(__dirname, "..", "data"),
  RAW_DIR: path.join(__dirname, "..", "data", "raw"),
  FEATURES_DIR: path.join(__dirname, "..", "data", "features"),
  MODEL_DIR: path.join(__dirname, "..", "models"),
  PYTHON_DIR: path.join(__dirname, "ml"),

  // ─── Dashboard ────────────────────────────────────────────────────
  WEB_PORT: 3001,
};

/**
 * Apply runtime overrides (from dashboard or CLI).
 */
function updateConfig(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (key in config) {
      const orig = config[key];
      // Type-coerce to match original type
      if (typeof orig === "number") config[key] = Number(value);
      else if (typeof orig === "boolean") config[key] = value === true || value === "true";
      else config[key] = value;
    }
  }
  return config;
}

module.exports = { config, updateConfig };
