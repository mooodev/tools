/**
 * Feature Engineering Pipeline
 *
 * Computes 50+ features from OHLCV candles:
 *   - Standard TA indicators (RSI, MACD, BB, Stochastic, etc.)
 *   - Statistical features (skewness, kurtosis, Hurst)
 *   - pump.fun-specific features (volume profile, micro-structure)
 *   - Price action micro-patterns
 *
 * Outputs a CSV-like format for LightGBM consumption via Python.
 */

const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const ind = require("../lib/indicators");

/**
 * Compute all features + binary label for a single token's candles.
 * Returns { features: number[][], labels: number[], featureNames: string[], timestamps: number[] }
 */
function computeFeatures(candles) {
  const n = candles.length;
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const timestamps = candles.map((c) => c.timestamp);

  const fc = {}; // feature columns

  // ─── Returns ──────────────────────────────────────────────────────
  const logReturns = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    logReturns[i] = closes[i - 1] !== 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
  }
  fc["log_return"] = logReturns;

  // Multi-scale ROC
  for (const p of config.ROC_PERIODS) {
    fc[`roc_${p}`] = ind.roc(closes, p);
  }

  // ─── Moving Average Ratios ────────────────────────────────────────
  for (const p of config.SMA_PERIODS) {
    const s = ind.sma(closes, p);
    fc[`sma_ratio_${p}`] = closes.map((c, i) => !isNaN(s[i]) && s[i] !== 0 ? c / s[i] - 1 : NaN);
  }
  for (const p of config.EMA_PERIODS) {
    const e = ind.ema(closes, p);
    fc[`ema_ratio_${p}`] = closes.map((c, i) => !isNaN(e[i]) && e[i] !== 0 ? c / e[i] - 1 : NaN);
  }

  // EMA crossover
  const ema12 = ind.ema(closes, 12);
  const ema26 = ind.ema(closes, 26);
  fc["ema_cross_12_26"] = ema12.map((v, i) =>
    !isNaN(v) && !isNaN(ema26[i]) && ema26[i] !== 0 ? v / ema26[i] - 1 : NaN
  );

  // ─── RSI ──────────────────────────────────────────────────────────
  const rsiVals = ind.rsi(closes, config.RSI_PERIOD);
  fc["rsi"] = rsiVals.map((v) => !isNaN(v) ? v / 100 : NaN);

  // ─── MACD ─────────────────────────────────────────────────────────
  const macdResult = ind.macd(closes, config.MACD_FAST, config.MACD_SLOW, config.MACD_SIGNAL);
  fc["macd_norm"] = macdResult.macdLine.map((v, i) => !isNaN(v) && closes[i] !== 0 ? v / closes[i] : NaN);
  fc["macd_signal_norm"] = macdResult.signal.map((v, i) => !isNaN(v) && closes[i] !== 0 ? v / closes[i] : NaN);
  fc["macd_hist_norm"] = macdResult.histogram.map((v, i) => !isNaN(v) && closes[i] !== 0 ? v / closes[i] : NaN);

  // ─── Bollinger Bands ──────────────────────────────────────────────
  const bb = ind.bollingerBands(closes, config.BBANDS_PERIOD, config.BBANDS_STD);
  fc["bb_percent_b"] = bb.percentB;
  fc["bb_bandwidth"] = bb.bandwidth;

  // ─── ATR ──────────────────────────────────────────────────────────
  const atrResult = ind.atr(highs, lows, closes, config.ATR_PERIOD);
  fc["atr_norm"] = atrResult.atr.map((v, i) => !isNaN(v) && closes[i] !== 0 ? v / closes[i] : NaN);

  // ─── Stochastic ───────────────────────────────────────────────────
  const stoch = ind.stochastic(highs, lows, closes, config.STOCH_K_PERIOD, config.STOCH_D_PERIOD);
  fc["stoch_k"] = stoch.k.map((v) => !isNaN(v) ? v / 100 : NaN);
  fc["stoch_d"] = stoch.d.map((v) => !isNaN(v) ? v / 100 : NaN);

  // ─── CCI ──────────────────────────────────────────────────────────
  const cciVals = ind.cci(highs, lows, closes, config.CCI_PERIOD);
  fc["cci_norm"] = cciVals.map((v) => !isNaN(v) ? v / 200 : NaN);

  // ─── Williams %R ──────────────────────────────────────────────────
  const willR = ind.williamsR(highs, lows, closes, config.WILLIAMS_PERIOD);
  fc["williams_r"] = willR.map((v) => !isNaN(v) ? (v + 100) / 100 : NaN);

  // ─── OBV ──────────────────────────────────────────────────────────
  if (config.OBV_ENABLED) {
    const obvVals = ind.obv(closes, volumes);
    const obvSma = ind.sma(obvVals, 20);
    fc["obv_ratio"] = obvVals.map((v, i) =>
      !isNaN(obvSma[i]) && obvSma[i] !== 0 ? v / Math.abs(obvSma[i]) - 1 : NaN
    );
  }

  // ─── VWAP ─────────────────────────────────────────────────────────
  if (config.VWAP_ENABLED) {
    const vwapVals = ind.vwap(highs, lows, closes, volumes);
    fc["vwap_ratio"] = closes.map((c, i) =>
      !isNaN(vwapVals[i]) && vwapVals[i] !== 0 ? c / vwapVals[i] - 1 : NaN
    );
  }

  // ─── MFI ──────────────────────────────────────────────────────────
  const mfiVals = ind.mfi(highs, lows, closes, volumes, 14);
  fc["mfi"] = mfiVals.map((v) => !isNaN(v) ? v / 100 : NaN);

  // ─── Volatility ───────────────────────────────────────────────────
  for (const p of [10, 20, 40]) {
    fc[`volatility_${p}`] = ind.rollingVolatility(closes, p);
  }
  const vol10 = ind.rollingVolatility(closes, 10);
  const vol40 = ind.rollingVolatility(closes, 40);
  fc["vol_ratio_10_40"] = vol10.map((v, i) =>
    !isNaN(v) && !isNaN(vol40[i]) && vol40[i] !== 0 ? v / vol40[i] : NaN
  );

  // ─── Statistical ──────────────────────────────────────────────────
  fc["skewness_20"] = ind.rollingSkewness(closes, 20);
  fc["kurtosis_20"] = ind.rollingKurtosis(closes, 20);
  fc["hurst"] = ind.hurstExponent(closes, 40);

  // ─── Price Structure ──────────────────────────────────────────────
  fc["body_ratio"] = candles.map((c) => {
    const range = c.high - c.low;
    return range !== 0 ? (c.close - c.open) / range : 0;
  });
  fc["upper_shadow"] = candles.map((c) => {
    const range = c.high - c.low;
    return range !== 0 ? (c.high - Math.max(c.open, c.close)) / range : 0;
  });
  fc["lower_shadow"] = candles.map((c) => {
    const range = c.high - c.low;
    return range !== 0 ? (Math.min(c.open, c.close) - c.low) / range : 0;
  });

  // ─── Volume Features ──────────────────────────────────────────────
  const volSma20 = ind.sma(volumes, 20);
  fc["vol_sma_ratio"] = volumes.map((v, i) =>
    !isNaN(volSma20[i]) && volSma20[i] !== 0 ? v / volSma20[i] - 1 : NaN
  );
  fc["vol_price_corr"] = rollingCorrelation(logReturns, volumes, 20);

  // ─── Pump.fun Micro-Structure Features ────────────────────────────
  // Volume acceleration (2nd derivative of volume)
  const volDiff = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    volDiff[i] = volumes[i - 1] !== 0 ? volumes[i] / volumes[i - 1] - 1 : 0;
  }
  const volAccel = new Array(n).fill(NaN);
  for (let i = 2; i < n; i++) {
    volAccel[i] = !isNaN(volDiff[i]) && !isNaN(volDiff[i - 1]) ? volDiff[i] - volDiff[i - 1] : NaN;
  }
  fc["vol_acceleration"] = volAccel;

  // Price momentum vs volume momentum divergence (smart money signal)
  const priceRoc4 = ind.roc(closes, 4);
  const volRoc4 = ind.roc(volumes, 4);
  fc["price_vol_divergence"] = priceRoc4.map((v, i) =>
    !isNaN(v) && !isNaN(volRoc4[i]) ? v - volRoc4[i] : NaN
  );

  // Buy pressure: ratio of (close-low) / (high-low) — accumulation signal
  fc["buy_pressure"] = candles.map((c) => {
    const range = c.high - c.low;
    return range !== 0 ? (c.close - c.low) / range : 0.5;
  });

  // Consecutive direction count (momentum persistence)
  const dirCount = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dir = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0;
    if (dir !== 0 && (dirCount[i - 1] > 0) === (dir > 0)) {
      dirCount[i] = dirCount[i - 1] + dir;
    } else {
      dirCount[i] = dir;
    }
  }
  fc["consecutive_dir"] = dirCount.map((v) => v / 10); // Normalize

  // Relative range (high-low) / close — volatility micro-structure
  fc["relative_range"] = candles.map((c) => c.close !== 0 ? (c.high - c.low) / c.close : 0);

  // Volume profile: z-score of current volume vs rolling window
  const volMean20 = ind.sma(volumes, 20);
  const volStd20 = rollingStd(volumes, 20);
  fc["vol_zscore"] = volumes.map((v, i) =>
    !isNaN(volMean20[i]) && !isNaN(volStd20[i]) && volStd20[i] !== 0
      ? (v - volMean20[i]) / volStd20[i] : NaN
  );

  // ─── Time Features ────────────────────────────────────────────────
  fc["hour_sin"] = candles.map((c) => Math.sin(2 * Math.PI * new Date(c.timestamp * 1000).getUTCHours() / 24));
  fc["hour_cos"] = candles.map((c) => Math.cos(2 * Math.PI * new Date(c.timestamp * 1000).getUTCHours() / 24));
  fc["dow_sin"] = candles.map((c) => Math.sin(2 * Math.PI * new Date(c.timestamp * 1000).getUTCDay() / 7));
  fc["dow_cos"] = candles.map((c) => Math.cos(2 * Math.PI * new Date(c.timestamp * 1000).getUTCDay() / 7));

  // ─── Assemble ─────────────────────────────────────────────────────
  const featureNames = Object.keys(fc);
  const horizon = config.PREDICTION_HORIZON;

  // Binary labels: does price go up GROWTH_THRESHOLD% in next horizon candles?
  const labels = new Array(n).fill(NaN);
  for (let i = 0; i < n - horizon; i++) {
    if (closes[i] === 0) continue;
    const futureReturn = (closes[i + horizon] - closes[i]) / closes[i];
    labels[i] = futureReturn >= config.GROWTH_THRESHOLD ? 1 : 0;
  }

  // Warmup: skip rows where any indicator is NaN
  const warmup = Math.max(
    config.SMA_PERIODS[config.SMA_PERIODS.length - 1],
    config.EMA_PERIODS[config.EMA_PERIODS.length - 1],
    config.RSI_PERIOD + 1,
    config.MACD_SLOW + config.MACD_SIGNAL,
    config.BBANDS_PERIOD,
    config.ATR_PERIOD,
    config.STOCH_K_PERIOD + config.STOCH_D_PERIOD,
    config.CCI_PERIOD,
    config.WILLIAMS_PERIOD,
    41, // Hurst
    20, // Volume SMA/correlation
  );

  const features = [];
  const validLabels = [];
  const validTimestamps = [];

  for (let i = warmup; i < n - horizon; i++) {
    const row = [];
    let valid = true;
    for (const name of featureNames) {
      const val = fc[name][i];
      if (val === undefined || val === null || isNaN(val) || !isFinite(val)) {
        valid = false;
        break;
      }
      row.push(val);
    }
    if (!valid || isNaN(labels[i])) continue;
    features.push(row);
    validLabels.push(labels[i]);
    validTimestamps.push(timestamps[i]);
  }

  return { features, labels: validLabels, featureNames, timestamps: validTimestamps };
}

/**
 * Process all raw token data and export as CSV for LightGBM.
 */
function exportTrainingData(rawDataArray, outputPath) {
  const featuresDir = config.FEATURES_DIR;
  if (!fs.existsSync(featuresDir)) fs.mkdirSync(featuresDir, { recursive: true });

  let allFeatures = [];
  let allLabels = [];
  let allTimestamps = [];
  let allTokenIds = [];
  let featureNames = null;

  for (const data of rawDataArray) {
    const candles = data.candles;
    if (!candles || candles.length < config.MIN_CANDLES) continue;

    const result = computeFeatures(candles);
    if (result.features.length === 0) continue;

    if (!featureNames) featureNames = result.featureNames;
    allFeatures.push(...result.features);
    allLabels.push(...result.labels);
    allTimestamps.push(...result.timestamps);
    allTokenIds.push(...new Array(result.features.length).fill(data.token.mint));
  }

  if (allFeatures.length === 0) {
    console.log("  [features] No valid training data produced.");
    return null;
  }

  // Write CSV
  const csvPath = outputPath || path.join(featuresDir, "training_data.csv");
  const header = [...featureNames, "label", "timestamp", "token_id"].join(",");
  const rows = allFeatures.map((row, i) =>
    [...row, allLabels[i], allTimestamps[i], allTokenIds[i]].join(",")
  );

  fs.writeFileSync(csvPath, [header, ...rows].join("\n"));

  // Write feature names separately for LightGBM
  fs.writeFileSync(
    path.join(featuresDir, "feature_names.json"),
    JSON.stringify(featureNames, null, 2)
  );

  const posCount = allLabels.filter((l) => l === 1).length;
  const negCount = allLabels.filter((l) => l === 0).length;

  const stats = {
    totalSamples: allFeatures.length,
    positiveRate: (posCount / allFeatures.length * 100).toFixed(1) + "%",
    positive: posCount,
    negative: negCount,
    tokens: rawDataArray.length,
    features: featureNames.length,
    csvPath,
  };

  fs.writeFileSync(path.join(featuresDir, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(`  [features] Exported ${allFeatures.length} samples, ${featureNames.length} features, ${posCount}/${negCount} pos/neg`);

  return stats;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rollingCorrelation(a, b, period) {
  const n = a.length;
  const result = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const va = isNaN(a[j]) ? 0 : a[j];
      const vb = isNaN(b[j]) ? 0 : b[j];
      sumA += va; sumB += vb; sumAB += va * vb; sumA2 += va * va; sumB2 += vb * vb;
    }
    const num = period * sumAB - sumA * sumB;
    const den = Math.sqrt((period * sumA2 - sumA * sumA) * (period * sumB2 - sumB * sumB));
    result[i] = den !== 0 ? num / den : 0;
  }
  return result;
}

function rollingStd(values, period) {
  const result = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j]; sumSq += values[j] * values[j];
    }
    const mean = sum / period;
    result[i] = Math.sqrt(sumSq / period - mean * mean);
  }
  return result;
}

module.exports = { computeFeatures, exportTrainingData };
