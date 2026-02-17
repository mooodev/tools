/**
 * Data Loader & Preprocessing Pipeline
 *
 * Reads token + candle data from pump-fun-parser output,
 * computes features, normalizes, and creates train/val/test splits.
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { computeFeatures, createSequences, normalizeFeatures, applyScaler } = require("./features");

/**
 * List all available token mints that have both token metadata and candle data.
 */
function listAvailableTokens() {
  if (!fs.existsSync(config.CANDLES_DIR)) return [];

  const candleFiles = fs.readdirSync(config.CANDLES_DIR).filter((f) => f.endsWith(".json"));

  const tokens = [];
  for (const file of candleFiles) {
    const mint = file.replace(".json", "");
    const tokenFile = path.join(config.TOKENS_DIR, file);
    const hasToken = fs.existsSync(tokenFile);

    tokens.push({
      mint,
      hasToken,
      candlePath: path.join(config.CANDLES_DIR, file),
      tokenPath: hasToken ? tokenFile : null,
    });
  }

  return tokens;
}

/**
 * Load candle data for a single token.
 */
function loadCandles(mint) {
  const filepath = path.join(config.CANDLES_DIR, `${mint}.json`);
  if (!fs.existsSync(filepath)) return null;

  const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
  return data;
}

/**
 * Load token metadata.
 */
function loadTokenMeta(mint) {
  const filepath = path.join(config.TOKENS_DIR, `${mint}.json`);
  if (!fs.existsSync(filepath)) return null;

  return JSON.parse(fs.readFileSync(filepath, "utf8"));
}

/**
 * Process a single token: load candles, compute features, return raw feature matrix + labels.
 */
function processToken(mint) {
  const candleData = loadCandles(mint);
  if (!candleData || !candleData.candles || candleData.candles.length < config.MIN_CANDLES) {
    return null;
  }

  const candles = candleData.candles;

  // Filter out candles with zero/invalid prices
  const validCandles = candles.filter(
    (c) => c.close > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.volume >= 0
  );

  if (validCandles.length < config.MIN_CANDLES) return null;

  const { features, labels, featureNames } = computeFeatures(validCandles);

  if (features.length < config.LOOKBACK_WINDOW + 10) return null;

  return { features, labels, featureNames, meta: candleData.meta };
}

/**
 * Load and process all available tokens, combine into a single dataset.
 * Returns the full dataset ready for splitting and training.
 */
function loadDataset() {
  const tokens = listAvailableTokens();
  console.log(`Found ${tokens.length} tokens with candle data.`);

  if (tokens.length === 0) {
    console.log(`\nNo data found in: ${config.CANDLES_DIR}`);
    console.log("Run the pump-fun-parser first to fetch token data.");
    return null;
  }

  let allFeatures = [];
  let allLabels = [];
  let featureNames = null;
  let processedCount = 0;
  const tokenStats = [];

  for (const token of tokens) {
    const result = processToken(token.mint);
    if (!result) continue;

    processedCount++;
    featureNames = result.featureNames;

    const startIdx = allFeatures.length;
    allFeatures.push(...result.features);
    allLabels.push(...result.labels);

    tokenStats.push({
      mint: token.mint,
      name: result.meta?.tokenName || token.mint.slice(0, 12),
      samples: result.features.length,
    });

    if (processedCount % 50 === 0) {
      console.log(`  Processed ${processedCount} tokens (${allFeatures.length} samples)...`);
    }
  }

  console.log(`\nProcessed ${processedCount}/${tokens.length} tokens.`);
  console.log(`Total samples: ${allFeatures.length}`);
  console.log(`Features per sample: ${featureNames ? featureNames.length : 0}`);

  if (allFeatures.length === 0) {
    console.log("No valid samples generated. Tokens may have too few candles.");
    return null;
  }

  // Label distribution
  const labelCounts = [0, 0, 0];
  for (const l of allLabels) labelCounts[l]++;
  console.log(`\nLabel distribution:`);
  console.log(`  Bearish (0): ${labelCounts[0]} (${((labelCounts[0] / allLabels.length) * 100).toFixed(1)}%)`);
  console.log(`  Neutral (1): ${labelCounts[1]} (${((labelCounts[1] / allLabels.length) * 100).toFixed(1)}%)`);
  console.log(`  Bullish (2): ${labelCounts[2]} (${((labelCounts[2] / allLabels.length) * 100).toFixed(1)}%)`);

  // Normalize features
  console.log(`\nNormalizing features (z-score with clipping)...`);
  const { normalized, scaler } = normalizeFeatures(allFeatures);

  // Create sequences for LSTM
  console.log(`Creating sequences (window=${config.LOOKBACK_WINDOW})...`);
  const { X, y } = createSequences(normalized, allLabels, config.LOOKBACK_WINDOW);
  console.log(`Sequences created: ${X.length}`);

  // Split into train/val/test (time-ordered, no shuffle — prevents look-ahead bias)
  const trainEnd = Math.floor(X.length * config.TRAIN_RATIO);
  const valEnd = Math.floor(X.length * (config.TRAIN_RATIO + config.VAL_RATIO));

  const dataset = {
    train: { X: X.slice(0, trainEnd), y: y.slice(0, trainEnd) },
    val: { X: X.slice(trainEnd, valEnd), y: y.slice(trainEnd, valEnd) },
    test: { X: X.slice(valEnd), y: y.slice(valEnd) },
    scaler,
    featureNames,
    tokenStats,
    labelCounts,
  };

  console.log(`\nDataset splits:`);
  console.log(`  Train: ${dataset.train.X.length} samples`);
  console.log(`  Val:   ${dataset.val.X.length} samples`);
  console.log(`  Test:  ${dataset.test.X.length} samples`);

  return dataset;
}

/**
 * Compute class weights to handle imbalanced labels.
 * Uses inverse frequency weighting.
 */
function computeClassWeights(labels) {
  const counts = [0, 0, 0];
  for (const l of labels) counts[l]++;

  const total = labels.length;
  const nClasses = 3;
  const weights = {};

  for (let i = 0; i < nClasses; i++) {
    weights[i] = counts[i] > 0 ? total / (nClasses * counts[i]) : 1;
  }

  return weights;
}

module.exports = {
  listAvailableTokens,
  loadCandles,
  loadTokenMeta,
  processToken,
  loadDataset,
  computeClassWeights,
};
