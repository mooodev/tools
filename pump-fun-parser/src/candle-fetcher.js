const config = require("./config");
const { fetchJSON, sleep } = require("./api-client");

/**
 * Find the best pool for a token on GeckoTerminal.
 * Pools are returned sorted by liquidity/volume — first one is usually best.
 *
 * @param {string} tokenAddress - Solana token mint address
 * @returns {Promise<{poolAddress: string, poolName: string}|null>}
 */
async function findPool(tokenAddress) {
  const url = `${config.GECKO_API}/networks/${config.GECKO_NETWORK}/tokens/${tokenAddress}/pools?page=1`;

  try {
    const data = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });

    if (!data.data || data.data.length === 0) {
      return null;
    }

    const pool = data.data[0];
    const attrs = pool.attributes;

    return {
      poolAddress: attrs.address,
      poolName: attrs.name || null,
      volumeUsd24h: attrs.volume_usd?.h24 || null,
      reserveInUsd: attrs.reserve_in_usd || null,
    };
  } catch (err) {
    console.error(`  [pool] Error finding pool for ${tokenAddress.slice(0, 12)}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch ALL OHLCV candlestick data for a token by walking backwards in time.
 * Uses GeckoTerminal free API (no key needed).
 *
 * @param {string} poolAddress - Pool address on GeckoTerminal
 * @param {object} options
 * @param {string} options.timeframe - "day", "hour", or "minute"
 * @param {string} options.aggregate - Aggregation period ("1", "4", "12", "5", "15")
 * @param {string} options.currency - "usd" or "token"
 * @returns {Promise<Array>} Array of candle objects sorted oldest-first
 */
async function fetchAllCandles(poolAddress, {
  timeframe = config.DEFAULT_TIMEFRAME,
  aggregate = config.DEFAULT_AGGREGATE,
  currency = config.DEFAULT_CURRENCY,
} = {}) {
  let allCandles = [];
  let beforeTimestamp = Math.floor(Date.now() / 1000);
  let page = 0;
  let emptyStreak = 0;

  while (true) {
    page++;
    const url =
      `${config.GECKO_API}/networks/${config.GECKO_NETWORK}/pools/${poolAddress}/ohlcv/${timeframe}` +
      `?aggregate=${aggregate}` +
      `&before_timestamp=${beforeTimestamp}` +
      `&limit=${config.GECKO_LIMIT}` +
      `&currency=${currency}`;

    let data;
    try {
      data = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });
    } catch (err) {
      if (err.message.includes("404")) break;
      // Wait and retry once on other errors
      await sleep(5000);
      try {
        data = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });
      } catch {
        break;
      }
    }

    const ohlcvList = data?.data?.attributes?.ohlcv_list;

    if (!ohlcvList || ohlcvList.length === 0) {
      emptyStreak++;
      if (emptyStreak >= 3) break;

      const jumpSeconds = getJumpSeconds(timeframe, aggregate);
      beforeTimestamp -= jumpSeconds;
      await sleep(config.GECKO_RATE_LIMIT_MS);
      continue;
    }

    emptyStreak = 0;

    const candles = ohlcvList.map((c) => ({
      timestamp: c[0],
      datetime: new Date(c[0] * 1000).toISOString(),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    allCandles.push(...candles);

    const oldestTimestamp = Math.min(...ohlcvList.map((c) => c[0]));
    beforeTimestamp = oldestTimestamp - 1;

    if (ohlcvList.length < config.GECKO_LIMIT) break;

    await sleep(config.GECKO_RATE_LIMIT_MS);
  }

  // Sort chronologically and deduplicate
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set();
  allCandles = allCandles.filter((c) => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  });

  return allCandles;
}

function getJumpSeconds(timeframe, aggregate) {
  const agg = parseInt(aggregate);
  switch (timeframe) {
    case "day":
      return config.GECKO_LIMIT * 86400 * agg;
    case "hour":
      return config.GECKO_LIMIT * 3600 * agg;
    case "minute":
      return config.GECKO_LIMIT * 60 * agg;
    default:
      return config.GECKO_LIMIT * 3600;
  }
}

module.exports = { findPool, fetchAllCandles };
