/**
 * Technical Analysis Indicators Module
 *
 * Computes a comprehensive set of TA indicators from OHLCV data.
 * Reused from ml-predictor with adaptations for variable timeframes.
 */

function sma(values, period) {
  const result = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result[i] = sum / period;
  }
  return result;
}

function ema(values, period) {
  const result = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

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

  let avgGain = 0, avgLoss = 0;
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

function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  const macdLine = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

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

function atr(highs, lows, closes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  const tr = new Array(closes.length).fill(NaN);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < closes.length; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  result[period - 1] = sum / period;
  for (let i = period; i < closes.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
  }
  return { atr: result, tr };
}

function stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  const kValues = new Array(closes.length).fill(NaN);
  for (let i = kPeriod - 1; i < closes.length; i++) {
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > highestHigh) highestHigh = highs[j];
      if (lows[j] < lowestLow) lowestLow = lows[j];
    }
    const range = highestHigh - lowestLow;
    kValues[i] = range !== 0 ? ((closes[i] - lowestLow) / range) * 100 : 50;
  }
  const dValues = sma(kValues.map((v) => (isNaN(v) ? 0 : v)), dPeriod);
  for (let i = 0; i < kPeriod - 1 + dPeriod - 1; i++) dValues[i] = NaN;
  return { k: kValues, d: dValues };
}

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

function williamsR(highs, lows, closes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > highestHigh) highestHigh = highs[j];
      if (lows[j] < lowestLow) lowestLow = lows[j];
    }
    const range = highestHigh - lowestLow;
    result[i] = range !== 0 ? ((highestHigh - closes[i]) / range) * -100 : -50;
  }
  return result;
}

function roc(values, period) {
  const result = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i - period] !== 0 ? (values[i] - values[i - period]) / values[i - period] : 0;
  }
  return result;
}

function obv(closes, volumes) {
  const result = new Array(closes.length).fill(0);
  result[0] = volumes[0] || 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) result[i] = result[i - 1] + volumes[i];
    else if (closes[i] < closes[i - 1]) result[i] = result[i - 1] - volumes[i];
    else result[i] = result[i - 1];
  }
  return result;
}

function vwap(highs, lows, closes, volumes) {
  const result = new Array(closes.length).fill(NaN);
  let cumTPV = 0, cumVol = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
    result[i] = cumVol !== 0 ? cumTPV / cumVol : tp;
  }
  return result;
}

function mfi(highs, lows, closes, volumes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  for (let i = period; i < closes.length; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const mf = tp[j] * volumes[j];
      if (tp[j] > tp[j - 1]) posFlow += mf;
      else negFlow += mf;
    }
    result[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
  }
  return result;
}

function rollingVolatility(closes, period = 20) {
  const returns = new Array(closes.length).fill(NaN);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
  }
  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let sum = 0, sumSq = 0;
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

function rollingSkewness(closes, period = 20) {
  const returns = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
  }
  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += returns[j];
    const mean = sum / period;
    let m2 = 0, m3 = 0;
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

function rollingKurtosis(closes, period = 20) {
  const returns = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
  }
  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += returns[j];
    const mean = sum / period;
    let m2 = 0, m4 = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = returns[j] - mean;
      m2 += d * d;
      m4 += d * d * d * d;
    }
    m2 /= period;
    m4 /= period;
    result[i] = m2 !== 0 ? m4 / (m2 * m2) - 3 : 0;
  }
  return result;
}

function hurstExponent(closes, period = 40) {
  const returns = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = closes[i - 1] !== 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
  }
  const result = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    const window = returns.slice(i - period + 1, i + 1);
    let sum = 0;
    for (const r of window) sum += r;
    const mean = sum / period;
    let cumDev = 0, maxDev = -Infinity, minDev = Infinity, sumSq = 0;
    for (const r of window) {
      cumDev += r - mean;
      if (cumDev > maxDev) maxDev = cumDev;
      if (cumDev < minDev) minDev = cumDev;
      sumSq += (r - mean) * (r - mean);
    }
    const range = maxDev - minDev;
    const std = Math.sqrt(sumSq / period);
    if (std > 0 && range > 0) {
      result[i] = Math.log(range / std) / Math.log(period);
    } else {
      result[i] = 0.5;
    }
  }
  return result;
}

module.exports = {
  sma, ema, rsi, macd, bollingerBands, atr, stochastic, cci,
  williamsR, roc, obv, vwap, mfi, rollingVolatility, rollingSkewness,
  rollingKurtosis, hurstExponent,
};
