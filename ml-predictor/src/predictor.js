/**
 * Prediction / Inference Module
 *
 * Uses a trained model to predict token growth from live or historical data.
 * Includes backtesting with simulated trading performance metrics.
 */

const fs = require("fs");
const config = require("./config");
const { initTF, loadModel } = require("./model");
const { loadCandles, loadTokenMeta, processToken, listAvailableTokens } = require("./data-loader");
const { computeFeatures, createSequences, applyScaler } = require("./features");

/**
 * Load the saved scaler from disk.
 */
function loadScaler() {
  if (!fs.existsSync(config.SCALER_PATH)) {
    throw new Error(`Scaler not found at ${config.SCALER_PATH}. Train the model first.`);
  }
  return JSON.parse(fs.readFileSync(config.SCALER_PATH, "utf8"));
}

/**
 * Predict growth direction for a single token.
 *
 * @param {string} mint - Token mint address (must have candle data on disk)
 * @returns {object} Prediction result with probabilities
 */
async function predictToken(mint) {
  const tf = await initTF();

  console.log(`\nLoading model and scaler...`);
  const model = await loadModel(config.MODEL_DIR);
  const scaler = loadScaler();

  const result = processToken(mint);
  if (!result) {
    console.log(`Cannot process token ${mint}: insufficient data.`);
    return null;
  }

  const { features } = result;

  // Apply saved scaler
  const normalized = applyScaler(features, scaler);

  // Create sequences (we want the last prediction)
  const { X } = createSequences(normalized, new Array(normalized.length).fill(0), config.LOOKBACK_WINDOW);

  if (X.length === 0) {
    console.log("Not enough data for prediction.");
    return null;
  }

  // Predict on the most recent window
  const lastWindow = X[X.length - 1];
  const inputTensor = tf.tensor3d([lastWindow]);
  const prediction = model.predict(inputTensor);
  const probs = await prediction.data();

  inputTensor.dispose();
  prediction.dispose();

  const classNames = ["Bearish", "Neutral", "Bullish"];
  const predictedClass = probs.indexOf(Math.max(...probs));

  const meta = loadTokenMeta(mint);
  const tokenName = meta?.name || meta?.symbol || mint.slice(0, 12);

  return {
    mint,
    tokenName,
    prediction: classNames[predictedClass],
    confidence: probs[predictedClass],
    probabilities: {
      bearish: probs[0],
      neutral: probs[1],
      bullish: probs[2],
    },
    horizon: `${config.PREDICTION_HORIZON} hours`,
    thresholds: {
      bullish: `>${(config.GROWTH_THRESHOLD_UP * 100).toFixed(0)}%`,
      bearish: `<${(config.GROWTH_THRESHOLD_DN * 100).toFixed(0)}%`,
    },
  };
}

/**
 * Screen all available tokens and rank by bullish probability.
 */
async function screenAll() {
  const tf = await initTF();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Token Screener — Ranking by Growth Probability");
  console.log("═══════════════════════════════════════════════════════\n");

  const model = await loadModel(config.MODEL_DIR);
  const scaler = loadScaler();
  const tokens = listAvailableTokens();

  const results = [];
  let processed = 0;

  for (const token of tokens) {
    const result = processToken(token.mint);
    if (!result) continue;

    const { features } = result;
    const normalized = applyScaler(features, scaler);
    const { X } = createSequences(normalized, new Array(normalized.length).fill(0), config.LOOKBACK_WINDOW);

    if (X.length === 0) continue;

    const lastWindow = X[X.length - 1];
    const inputTensor = tf.tensor3d([lastWindow]);
    const prediction = model.predict(inputTensor);
    const probs = await prediction.data();

    inputTensor.dispose();
    prediction.dispose();

    const meta = loadTokenMeta(token.mint);
    results.push({
      mint: token.mint,
      name: meta?.name || meta?.symbol || token.mint.slice(0, 12),
      bearish: probs[0],
      neutral: probs[1],
      bullish: probs[2],
      signal: probs[2] > probs[0] ? "BUY" : probs[0] > probs[2] ? "SELL" : "HOLD",
    });

    processed++;
    if (processed % 25 === 0) {
      console.log(`  Screened ${processed} tokens...`);
    }
  }

  // Sort by bullish probability (descending)
  results.sort((a, b) => b.bullish - a.bullish);

  console.log(`\nScreened ${results.length} tokens.\n`);
  console.log("─── Top 20 Bullish ────────────────────────────────────\n");
  console.log("  Rank  Signal  Bull%   Bear%   Token");
  console.log("  ────  ──────  ──────  ──────  ─────────────────────");

  const top = results.slice(0, 20);
  top.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(4)}  ${r.signal.padEnd(6)}  ` +
      `${(r.bullish * 100).toFixed(1).padStart(5)}%  ` +
      `${(r.bearish * 100).toFixed(1).padStart(5)}%  ` +
      `${r.name}`
    );
  });

  console.log("\n─── Top 10 Bearish ────────────────────────────────────\n");
  const bottom = results.slice(-10).reverse();
  bottom.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(4)}  ${r.signal.padEnd(6)}  ` +
      `${(r.bullish * 100).toFixed(1).padStart(5)}%  ` +
      `${(r.bearish * 100).toFixed(1).padStart(5)}%  ` +
      `${r.name}`
    );
  });

  return results;
}

/**
 * Backtest: simulate trading on the test portion of data.
 * Uses a simple strategy: buy when model predicts bullish, sell when bearish.
 */
async function backtest() {
  const tf = await initTF();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Backtest — Simulated Trading Performance");
  console.log("═══════════════════════════════════════════════════════\n");

  const model = await loadModel(config.MODEL_DIR);
  const scaler = loadScaler();
  const tokens = listAvailableTokens();

  let totalTrades = 0;
  let winningTrades = 0;
  let totalReturn = 0;
  const tradeReturns = [];

  for (const token of tokens) {
    const candleData = loadCandles(token.mint);
    if (!candleData || !candleData.candles || candleData.candles.length < config.MIN_CANDLES) continue;

    const candles = candleData.candles.filter(
      (c) => c.close > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.volume >= 0
    );
    if (candles.length < config.MIN_CANDLES) continue;

    const { features, labels } = computeFeatures(candles);
    if (features.length < config.LOOKBACK_WINDOW + 10) continue;

    const normalized = applyScaler(features, scaler);
    const { X, y } = createSequences(normalized, labels, config.LOOKBACK_WINDOW);
    if (X.length === 0) continue;

    // Only test on the last 15% of data
    const testStart = Math.floor(X.length * 0.85);
    const testX = X.slice(testStart);
    const testY = y.slice(testStart);

    if (testX.length === 0) continue;

    // Predict all test samples at once
    const inputTensor = tf.tensor3d(testX);
    const predictions = model.predict(inputTensor);
    const predData = await predictions.data();
    inputTensor.dispose();
    predictions.dispose();

    // Simulate trades
    for (let i = 0; i < testX.length; i++) {
      const bearProb = predData[i * 3];
      const neutralProb = predData[i * 3 + 1];
      const bullProb = predData[i * 3 + 2];

      // Only trade when confident
      if (bullProb > 0.5) {
        // "Buy" — check if label was actually bullish
        totalTrades++;
        const actualReturn = testY[i] === 2 ? config.GROWTH_THRESHOLD_UP
          : testY[i] === 0 ? config.GROWTH_THRESHOLD_DN
          : 0;
        totalReturn += actualReturn;
        tradeReturns.push(actualReturn);
        if (actualReturn > 0) winningTrades++;
      } else if (bearProb > 0.5) {
        // "Sell" / short — inverse logic
        totalTrades++;
        const actualReturn = testY[i] === 0 ? -config.GROWTH_THRESHOLD_DN
          : testY[i] === 2 ? -config.GROWTH_THRESHOLD_UP
          : 0;
        totalReturn += actualReturn;
        tradeReturns.push(actualReturn);
        if (actualReturn > 0) winningTrades++;
      }
    }
  }

  // Results
  console.log(`Total trades:   ${totalTrades}`);
  console.log(`Winning trades: ${winningTrades}`);
  console.log(`Win rate:       ${totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0}%`);
  console.log(`Total return:   ${(totalReturn * 100).toFixed(2)}%`);

  if (tradeReturns.length > 0) {
    const avgReturn = totalReturn / tradeReturns.length;
    const variance = tradeReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / tradeReturns.length;
    const stdReturn = Math.sqrt(variance);
    const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0; // Annualized

    console.log(`Avg return/trade: ${(avgReturn * 100).toFixed(3)}%`);
    console.log(`Std return:       ${(stdReturn * 100).toFixed(3)}%`);
    console.log(`Sharpe ratio:     ${sharpe.toFixed(2)} (annualized)`);
  }

  console.log("\n═══════════════════════════════════════════════════════\n");
}

module.exports = { predictToken, screenAll, backtest };
