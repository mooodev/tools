#!/usr/bin/env node

/**
 * ML Token Growth Predictor
 *
 * A TensorFlow.js-based machine learning system that predicts token price
 * growth using technical analysis indicators and Simons-style quantitative
 * features. Supports GPU acceleration.
 *
 * Usage:
 *   node src/index.js train              Train the model on all available data
 *   node src/index.js evaluate           Walk-forward cross-validation
 *   node src/index.js predict <mint>     Predict growth for a specific token
 *   node src/index.js screen             Screen all tokens, rank by signal
 *   node src/index.js backtest           Backtest on held-out data
 *   node src/index.js web                Start WebGPU training web interface
 *   node src/index.js info               Show dataset info and feature list
 */

const fs = require("fs");
const config = require("./config");

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "info";

  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║   ML Token Growth Predictor                          ║");
  console.log("║   TensorFlow.js + LSTM + Self-Attention              ║");
  console.log("║   Simons-style Quantitative Feature Engineering      ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  switch (command) {
    case "train": {
      const { train } = require("./trainer");
      await train();
      break;
    }

    case "evaluate": {
      const { walkForwardValidation } = require("./trainer");
      const nFolds = parseInt(args[1]) || 5;
      await walkForwardValidation(nFolds);
      break;
    }

    case "predict": {
      const mint = args[1];
      if (!mint) {
        console.log("Usage: node src/index.js predict <mint_address>");
        console.log("\nAvailable tokens:");
        listTokens();
        process.exit(1);
      }

      const { predictToken } = require("./predictor");
      const result = await predictToken(mint);

      if (result) {
        console.log("\n═══════════════════════════════════════════════════════");
        console.log(`  Prediction for: ${result.tokenName}`);
        console.log("═══════════════════════════════════════════════════════\n");
        console.log(`  Mint:       ${result.mint}`);
        console.log(`  Signal:     ${result.prediction}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`  Horizon:    ${result.horizon}`);
        console.log(`\n  Probabilities:`);
        console.log(`    Bearish (< ${result.thresholds.bearish}):  ${(result.probabilities.bearish * 100).toFixed(1)}%`);
        console.log(`    Neutral:                ${(result.probabilities.neutral * 100).toFixed(1)}%`);
        console.log(`    Bullish (> ${result.thresholds.bullish}): ${(result.probabilities.bullish * 100).toFixed(1)}%`);
        console.log("\n═══════════════════════════════════════════════════════\n");
      }
      break;
    }

    case "screen": {
      const { screenAll } = require("./predictor");
      await screenAll();
      break;
    }

    case "backtest": {
      const { backtest } = require("./predictor");
      await backtest();
      break;
    }

    case "web": {
      const { startServer } = require("./server");
      startServer();
      break;
    }

    case "info":
    default: {
      showInfo();
      break;
    }
  }
}

function showInfo() {
  const { listAvailableTokens } = require("./data-loader");
  const { getFeatureNames, computeFeatures } = require("./features");

  console.log("─── Configuration ──────────────────────────────────────\n");
  console.log(`  Candles dir:        ${config.CANDLES_DIR}`);
  console.log(`  Tokens dir:         ${config.TOKENS_DIR}`);
  console.log(`  Model dir:          ${config.MODEL_DIR}`);
  console.log(`  Lookback window:    ${config.LOOKBACK_WINDOW} hours`);
  console.log(`  Prediction horizon: ${config.PREDICTION_HORIZON} hours`);
  console.log(`  Min candles/token:  ${config.MIN_CANDLES}`);
  console.log(`  Bullish threshold:  >${(config.GROWTH_THRESHOLD_UP * 100).toFixed(0)}%`);
  console.log(`  Bearish threshold:  <${(config.GROWTH_THRESHOLD_DN * 100).toFixed(0)}%`);

  console.log("\n─── Model Architecture ─────────────────────────────────\n");
  console.log(`  LSTM Layer 1:    ${config.LSTM_UNITS_1} units`);
  console.log(`  Self-Attention:  64-dim Q/K/V`);
  console.log(`  LSTM Layer 2:    ${config.LSTM_UNITS_2} units`);
  console.log(`  Dense Layer:     ${config.DENSE_UNITS} units`);
  console.log(`  Dropout:         ${config.DROPOUT_RATE}`);
  console.log(`  Learning rate:   ${config.LEARNING_RATE}`);
  console.log(`  Batch size:      ${config.BATCH_SIZE}`);
  console.log(`  Max epochs:      ${config.EPOCHS}`);
  console.log(`  Early stopping:  patience=${config.PATIENCE}`);

  const tokens = listAvailableTokens();
  console.log(`\n─── Data ───────────────────────────────────────────────\n`);
  console.log(`  Available tokens: ${tokens.length}`);

  const hasModel = fs.existsSync(`${config.MODEL_DIR}/model.json`);
  console.log(`  Trained model:    ${hasModel ? "Yes" : "No — run 'train' first"}`);

  console.log("\n─── Features (Simons-style) ────────────────────────────\n");

  const featureList = [
    "log_return                  — Log returns",
    "roc_1/3/6/12/24             — Rate of change (multi-scale momentum)",
    "sma_ratio_5/10/20/50        — Price / SMA ratio (mean reversion)",
    "ema_ratio_5/12/26/50        — Price / EMA ratio",
    "ema_cross_12_26             — EMA crossover signal",
    "rsi                         — Relative Strength Index (0-1)",
    "macd_norm/signal/histogram  — MACD (price-normalized)",
    "bb_percent_b/bandwidth      — Bollinger Bands",
    "atr_norm                    — Average True Range (normalized)",
    "stoch_k/stoch_d             — Stochastic Oscillator",
    "cci_norm                    — Commodity Channel Index",
    "williams_r                  — Williams %R",
    "obv_ratio                   — On-Balance Volume ratio",
    "vwap_ratio                  — VWAP deviation",
    "mfi                         — Money Flow Index",
    "volatility_10/20/40         — Multi-scale realized volatility",
    "vol_ratio_10_40             — Volatility regime detector",
    "skewness_20                 — Return distribution skewness",
    "kurtosis_20                 — Return distribution kurtosis (fat tails)",
    "hurst                       — Hurst exponent (trend vs mean-revert)",
    "body_ratio                  — Candle body structure",
    "upper_shadow/lower_shadow   — Shadow analysis",
    "vol_sma_ratio               — Volume surge detector",
    "vol_price_corr              — Volume-price correlation",
    "hour_sin/cos, dow_sin/cos   — Cyclical time encoding",
  ];

  for (const f of featureList) {
    console.log(`  ${f}`);
  }

  console.log("\n─── Commands ───────────────────────────────────────────\n");
  console.log("  node src/index.js train              Train the model");
  console.log("  node src/index.js evaluate [folds]   Walk-forward validation");
  console.log("  node src/index.js predict <mint>     Predict single token");
  console.log("  node src/index.js screen             Screen all tokens");
  console.log("  node src/index.js backtest           Backtest strategy");
  console.log("  node src/index.js web                Start WebGPU web interface (M1 GPU)");
  console.log("  node src/index.js info               Show this info");
  console.log("");
}

function listTokens() {
  const { listAvailableTokens } = require("./data-loader");
  const tokens = listAvailableTokens();

  if (tokens.length === 0) {
    console.log("  (no tokens found — run pump-fun-parser first)");
    return;
  }

  const display = tokens.slice(0, 20);
  for (const t of display) {
    console.log(`  ${t.mint}`);
  }
  if (tokens.length > 20) {
    console.log(`  ... and ${tokens.length - 20} more`);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
