/**
 * Data Loader & Preprocessing Pipeline
 *
 * Reads token + candle data from pump-fun-parser output,
 * computes features, normalizes, and creates train/val/test splits.
 *
 * Memory-efficient: stores features as flat Float32Array, creates
 * sequence batches on-the-fly during training (never materializes
 * the full [N x lookback x features] tensor).
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { computeFeatures, normalizeFeatures, applyScaler } = require("./features");

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
 *
 * Memory-efficient: stores data as flat typed arrays.
 * Does NOT pre-create LSTM sequences — those are built per-batch during training.
 *
 * Returns:
 *   featureData  - Float32Array, row-major [nSamples x nFeatures]
 *   labelData    - Int32Array [nSamples]
 *   trainRange   - [startIdx, endIdx) for training samples
 *   valRange     - [startIdx, endIdx) for validation samples
 *   testRange    - [startIdx, endIdx) for test samples
 *   scaler       - { means, stds } for normalizing new data
 *   featureNames - string[]
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

  const nFeatures = featureNames.length;
  const nSamples = allFeatures.length;

  // Label distribution
  const labelCounts = [0, 0, 0];
  for (const l of allLabels) labelCounts[l]++;
  console.log(`\nLabel distribution:`);
  console.log(`  Bearish (0): ${labelCounts[0]} (${((labelCounts[0] / nSamples) * 100).toFixed(1)}%)`);
  console.log(`  Neutral (1): ${labelCounts[1]} (${((labelCounts[1] / nSamples) * 100).toFixed(1)}%)`);
  console.log(`  Bullish (2): ${labelCounts[2]} (${((labelCounts[2] / nSamples) * 100).toFixed(1)}%)`);

  // Normalize features (z-score with outlier clipping)
  console.log(`\nNormalizing features (z-score with clipping)...`);
  const { normalized, scaler } = normalizeFeatures(allFeatures);

  // Pack into flat Float32Array for memory efficiency
  // Row i, col j = featureData[i * nFeatures + j]
  console.log(`Packing into typed arrays (${((nSamples * nFeatures * 4) / 1024 / 1024).toFixed(0)} MB)...`);
  const featureData = new Float32Array(nSamples * nFeatures);
  for (let i = 0; i < nSamples; i++) {
    const row = normalized[i];
    const offset = i * nFeatures;
    for (let j = 0; j < nFeatures; j++) {
      featureData[offset + j] = row[j];
    }
  }
  const labelData = new Int32Array(allLabels);

  // Free the JS arrays now that we have typed arrays
  allFeatures = null;
  allLabels = null;

  // Split: valid sample indices start at LOOKBACK_WINDOW
  // (each sample needs LOOKBACK_WINDOW preceding rows for the LSTM window)
  const lookback = config.LOOKBACK_WINDOW;
  const validStart = lookback;
  const validCount = nSamples - lookback;

  const trainEnd = validStart + Math.floor(validCount * config.TRAIN_RATIO);
  const valEnd = validStart + Math.floor(validCount * (config.TRAIN_RATIO + config.VAL_RATIO));
  const testEnd = validStart + validCount;

  const dataset = {
    featureData,
    labelData,
    nSamples,
    nFeatures,
    lookback,
    trainRange: [validStart, trainEnd],
    valRange: [trainEnd, valEnd],
    testRange: [valEnd, testEnd],
    scaler,
    featureNames,
    tokenStats,
    labelCounts,
  };

  console.log(`\nDataset splits (sample indices → sequence windows):`);
  console.log(`  Train: ${trainEnd - validStart} samples [${validStart}..${trainEnd})`);
  console.log(`  Val:   ${valEnd - trainEnd} samples [${trainEnd}..${valEnd})`);
  console.log(`  Test:  ${testEnd - valEnd} samples [${valEnd}..${testEnd})`);

  return dataset;
}

/**
 * Create a batch of LSTM sequences from the flat feature array.
 *
 * For each sample index i, the input sequence is featureData rows [i-lookback .. i-1]
 * and the label is labelData[i].
 *
 * @param {Float32Array} featureData - Flat row-major feature matrix
 * @param {Int32Array} labelData - Labels array
 * @param {number[]} indices - Array of sample indices for this batch
 * @param {number} nFeatures - Number of features per timestep
 * @param {number} lookback - LSTM window size
 * @param {object} tf - TensorFlow.js instance
 * @returns {{ xTensor: tf.Tensor3D, yTensor: tf.Tensor1D }}
 */
function createBatchTensors(featureData, labelData, indices, nFeatures, lookback, tf) {
  const batchSize = indices.length;
  const xBuf = new Float32Array(batchSize * lookback * nFeatures);
  const yBuf = new Float32Array(batchSize);

  for (let b = 0; b < batchSize; b++) {
    const sampleIdx = indices[b];
    yBuf[b] = labelData[sampleIdx];

    // Copy lookback rows: [sampleIdx - lookback, sampleIdx)
    for (let t = 0; t < lookback; t++) {
      const srcRow = sampleIdx - lookback + t;
      const srcOffset = srcRow * nFeatures;
      const dstOffset = (b * lookback + t) * nFeatures;
      // Fast typed array copy
      xBuf.set(featureData.subarray(srcOffset, srcOffset + nFeatures), dstOffset);
    }
  }

  const xTensor = tf.tensor3d(xBuf, [batchSize, lookback, nFeatures]);
  const yTensor = tf.tensor1d(yBuf);

  return { xTensor, yTensor };
}

/**
 * Compute class weights to handle imbalanced labels.
 * Uses inverse frequency weighting.
 */
function computeClassWeights(labelData, startIdx, endIdx) {
  const counts = [0, 0, 0];
  for (let i = startIdx; i < endIdx; i++) {
    counts[labelData[i]]++;
  }

  const total = endIdx - startIdx;
  const nClasses = 3;
  const weights = {};

  for (let i = 0; i < nClasses; i++) {
    weights[i] = counts[i] > 0 ? total / (nClasses * counts[i]) : 1;
  }

  return weights;
}

/**
 * Generate a shuffled array of indices for a given range.
 */
function shuffleIndices(start, end) {
  const indices = [];
  for (let i = start; i < end; i++) indices.push(i);

  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  return indices;
}

/**
 * Generate sequential (non-shuffled) array of indices for a given range.
 */
function sequentialIndices(start, end) {
  const indices = [];
  for (let i = start; i < end; i++) indices.push(i);
  return indices;
}

module.exports = {
  listAvailableTokens,
  loadCandles,
  loadTokenMeta,
  processToken,
  loadDataset,
  createBatchTensors,
  computeClassWeights,
  shuffleIndices,
  sequentialIndices,
};
