const path = require("path");

module.exports = {
  // Device: "metal" (M1/M2/M3 GPU via WebGPU), "gpu" (NVIDIA CUDA),
  //         "cpu", or "auto" (try metal → cuda → cpu → pure JS)
  DEVICE: "metal",

  // Data paths (reads from pump-fun-parser output)
  CANDLES_DIR: path.join(__dirname, "..", "..", "pump-fun-parser", "data", "candles"),
  TOKENS_DIR: path.join(__dirname, "..", "..", "pump-fun-parser", "data", "tokens"),

  // Model storage
  MODEL_DIR: path.join(__dirname, "..", "models"),
  SCALER_PATH: path.join(__dirname, "..", "models", "scaler.json"),

  // Feature engineering
  LOOKBACK_WINDOW: 48,        // Hours of history the model sees per sample
  PREDICTION_HORIZON: 6,      // Hours ahead to predict
  MIN_CANDLES: 100,           // Minimum candles required per token

  // Target: classify future return into buckets
  // "growth" = close[t+horizon] / close[t] - 1
  GROWTH_THRESHOLD_UP: 0.10,  // >10% = strong buy signal
  GROWTH_THRESHOLD_DN: -0.05, // <-5% = sell signal

  // Model hyperparameters
  LSTM_UNITS_1: 128,
  LSTM_UNITS_2: 64,
  DENSE_UNITS: 32,
  DROPOUT_RATE: 0.3,
  LEARNING_RATE: 0.001,
  BATCH_SIZE: 64,
  EPOCHS: 50,
  PATIENCE: 8,               // Early stopping patience
  VALIDATION_SPLIT: 0.15,

  // Walk-forward validation
  TRAIN_RATIO: 0.70,
  VAL_RATIO: 0.15,
  TEST_RATIO: 0.15,

  // Indicator periods (Simons-style: multiple scales)
  SMA_PERIODS: [5, 10, 20, 50],
  EMA_PERIODS: [5, 12, 26, 50],
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
  ROC_PERIODS: [1, 3, 6, 12, 24],
  OBV_ENABLED: true,
  VWAP_ENABLED: true,
};
