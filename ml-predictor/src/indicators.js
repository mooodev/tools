/**
 * Technical Analysis Indicators Module
 *
 * Computes a comprehensive set of TA indicators from OHLCV data.
 * Designed for ML consumption: all outputs are numeric arrays aligned
 * with the input candle array length.
 *
 * Simons/Renaissance style: multi-scale, statistical, mean-reversion
 * and momentum indicators combined.
 */

// ─── Simple Moving Average ───────────────────────────────────────────

function sma(values, period) {
  const result = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result[i] = sum / period;
  }
  return result;
}

// ─── Exponential Moving Average ──────────────────────────────────────

function ema(values, period) {
  const result = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);

  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// ─── RSI (Relative Strength Index) ──────────────────────────────────

function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  const gains = [];
  const losses = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // Initial average
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

// ─── MACD ────────────────────────────────────────────────────────────

function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);

  const macdLine = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Signal line = EMA of MACD line (only over valid values)
  const validStart = macdLine.findIndex((v) => !isNaN(v));
  const validMacd = macdLine.slice(validStart);
  const signalRaw = ema(validMacd, signalPeriod);

  const signal = new Array(closes.length).fill(NaN);
  const histogram = new Array(closes.length).fill(NaN);

  for (let i = 0; i < signalRaw.length; i++) {
    signal[validStart + i] = signalRaw[i];
    if (!isNaN(macdLine[validStart + i]) && !isNaN(signalRaw[i])) {
      histogram[validStart + i] = macdLine[validStart + i] - signalRaw[i];
    }
  }

  return { macdLine, signal, histogram };
}

// ─── Bollinger Bands ────────────────────────────────────────────────

function bollingerBands(closes, period = 20, stdDev = 2) {
  const middle = sma(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  const bandwidth = new Array(closes.length).fill(NaN);
  const percentB = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(closes[j] - middle[i], 2);
    }
    const std = Math.sqrt(sumSq / period);

    upper[i] = middle[i] + stdDev * std;
    lower[i] = middle[i] - stdDev * std;

    const bandWidth = upper[i] - lower[i];
    bandwidth[i] = middle[i] !== 0 ? bandWidth / middle[i] : 0;
    percentB[i] = bandWidth !== 0 ? (closes[i] - lower[i]) / bandWidth : 0.5;
  }

  return { upper, middle, lower, bandwidth, percentB };
}

// ─── ATR (Average True Range) ───────────────────────────────────────

function atr(highs, lows, closes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  const tr = new Array(closes.length).fill(NaN);

  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < closes.length; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }

  // Initial ATR = simple average of first `period` TRs
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  result[period - 1] = sum / period;

  for (let i = period; i < closes.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
  }

  return { atr: result, tr };
}

// ─── Stochastic Oscillator ──────────────────────────────────────────

function stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  const kValues = new Array(closes.length).fill(NaN);

  for (let i = kPeriod - 1; i < closes.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > highestHigh) highestHigh = highs[j];
      if (lows[j] < lowestLow) lowestLow = lows[j];
    }
    const range = highestHigh - lowestLow;
    kValues[i] = range !== 0 ? ((closes[i] - lowestLow) / range) * 100 : 50;
  }

  const dValues = sma(kValues.map((v) => (isNaN(v) ? 0 : v)), dPeriod);
  // NaN out the d-values where k was NaN
  for (let i = 0; i < kPeriod - 1 + dPeriod - 1; i++) {
    dValues[i] = NaN;
  }

  return { k: kValues, d: dValues };
}

// ─── CCI (Commodity Channel Index) ──────────────────────────────────

function cci(highs, lows, closes, period = 20) {
  const result = new Array(closes.length).fill(NaN);
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);

  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j];
    const mean = sum / period;

    let meanDev = 0;
    for (let j = i - period + 1; j <= i; j++) meanDev += Math.abs(tp[j] - mean);
    meanDev /= period;

    result[i] = meanDev !== 0 ? (tp[i] - mean) / (0.015 * meanDev) : 0;
  }

  return result;
}

// ─── Williams %R ────────────────────────────────────────────────────

function williamsR(highs, lows, closes, period = 14) {
  const result = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > highestHigh) highestHigh = highs[j];
      if (lows[j] < lowestLow) lowestLow = lows[j];
    }
    const range = highestHigh - lowestLow;
    result[i] = range !== 0 ? ((highestHigh - closes[i]) / range) * -100 : -50;
  }

  return result;
}

// ─── Rate of Change ─────────────────────────────────────────────────

function roc(values, period) {
  const result = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i - period] !== 0
      ? (values[i] - values[i - period]) / values[i - period]
      : 0;
  }
  return result;
}

// ─── OBV (On-Balance Volume) ────────────────────────────────────────

function obv(closes, volumes) {
  const result = new Array(closes.length).fill(0);
  result[0] = volumes[0] || 0;

  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      result[i] = result[i - 1] + volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      result[i] = result[i - 1] - volumes[i];
    } else {
      result[i] = result[i - 1];
    }
  }

  return result;
}

// ─── VWAP (Volume Weighted Average Price) ───────────────────────────

function vwap(highs, lows, closes, volumes) {
  const result = new Array(closes.length).fill(NaN);
  let cumTPV = 0;
  let cumVol = 0;

  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
    result[i] = cumVol !== 0 ? cumTPV / cumVol : tp;
  }

  return result;
}

// ─── Money Flow Index ───────────────────────────────────────────────

function mfi(highs, lows, closes, volumes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);

  for (let i = period; i < closes.length; i++) {
    let posFlow = 0;
    let negFlow = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const mf = tp[j] * volumes[j];
      if (tp[j] > tp[j - 1]) {
        posFlow += mf;
      } else {
        negFlow += mf;
      }
    }

    result[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
  }

  return result;
}

// ─── Volatility (rolling standard deviation of returns) ─────────────

function rollingVolatility(closes, period = 20) {
  const returns = new Array(closes.length).fill(NaN);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0
      ? Math.log(closes[i] / closes[i - 1])
      : 0;
  }

  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let sum = 0;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const r = returns[j] || 0;
      sum += r;
      sumSq += r * r;
    }
    const mean = sum / period;
    result[i] = Math.sqrt(sumSq / period - mean * mean);
  }

  return result;
}

// ─── Skewness of returns (rolling) ──────────────────────────────────

function rollingSkewness(closes, period = 20) {
  const returns = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0
      ? Math.log(closes[i] / closes[i - 1])
      : 0;
  }

  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += returns[j];
    const mean = sum / period;

    let m2 = 0;
    let m3 = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = returns[j] - mean;
      m2 += d * d;
      m3 += d * d * d;
    }
    m2 /= period;
    m3 /= period;

    const std = Math.sqrt(m2);
    result[i] = std !== 0 ? m3 / (std * std * std) : 0;
  }

  return result;
}

// ─── Kurtosis of returns (rolling) ──────────────────────────────────

function rollingKurtosis(closes, period = 20) {
  const returns = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0
      ? Math.log(closes[i] / closes[i - 1])
      : 0;
  }

  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += returns[j];
    const mean = sum / period;

    let m2 = 0;
    let m4 = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = returns[j] - mean;
      m2 += d * d;
      m4 += d * d * d * d;
    }
    m2 /= period;
    m4 /= period;

    result[i] = m2 !== 0 ? m4 / (m2 * m2) - 3 : 0; // Excess kurtosis
  }

  return result;
}

// ─── Hurst Exponent (simplified R/S analysis) ──────────────────────

function hurstExponent(closes, period = 40) {
  const returns = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0
      ? Math.log(closes[i] / closes[i - 1])
      : 0;
  }

  const result = new Array(closes.length).fill(NaN);

  for (let i = period; i < closes.length; i++) {
    const window = returns.slice(i - period + 1, i + 1);
    let sum = 0;
    for (const r of window) sum += r;
    const mean = sum / period;

    // Cumulative deviation
    let cumDev = 0;
    let maxDev = -Infinity;
    let minDev = Infinity;
    let sumSq = 0;

    for (const r of window) {
      cumDev += r - mean;
      if (cumDev > maxDev) maxDev = cumDev;
      if (cumDev < minDev) minDev = cumDev;
      sumSq += (r - mean) * (r - mean);
    }

    const range = maxDev - minDev;
    const std = Math.sqrt(sumSq / period);

    if (std > 0 && range > 0) {
      const rs = range / std;
      result[i] = Math.log(rs) / Math.log(period);
    } else {
      result[i] = 0.5; // Random walk default
    }
  }

  return result;
}

module.exports = {
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  atr,
  stochastic,
  cci,
  williamsR,
  roc,
  obv,
  vwap,
  mfi,
  rollingVolatility,
  rollingSkewness,
  rollingKurtosis,
  hurstExponent,
};
