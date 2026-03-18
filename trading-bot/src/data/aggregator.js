/**
 * Candle Aggregator — re-aggregate base candles to any timeframe.
 * E.g., convert 15m candles to 30m, 1h, or 5m candles.
 */

/**
 * Aggregate candles to a different timeframe.
 * @param {Array} candles - Input candle array (sorted chronologically)
 * @param {number} targetMinutes - Target candle duration in minutes
 * @param {number} sourceMinutes - Source candle duration in minutes
 * @returns {Array} Aggregated candles
 */
function aggregateCandles(candles, targetMinutes, sourceMinutes) {
  if (targetMinutes <= sourceMinutes) return candles;

  const ratio = Math.round(targetMinutes / sourceMinutes);
  const result = [];

  for (let i = 0; i < candles.length; i += ratio) {
    const chunk = candles.slice(i, i + ratio);
    if (chunk.length === 0) continue;

    result.push({
      timestamp: chunk[0].timestamp,
      datetime: chunk[0].datetime,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
    });
  }

  return result;
}

module.exports = { aggregateCandles };
