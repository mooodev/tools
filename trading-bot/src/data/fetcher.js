/**
 * Data Fetcher — pulls 72h of candle data for graduated pump.fun tokens.
 * Reuses pump-fun-parser patterns with configurable timeframe.
 */

const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { fetchJSON, sleep } = require("../lib/api-client");

/**
 * Fetch a page of graduated tokens from pump.fun.
 */
async function fetchGraduatedPage({ offset = 0, limit = config.COINS_PER_PAGE, sort = "market_cap", order = "DESC" } = {}) {
  const params = new URLSearchParams({
    offset: String(offset), limit: String(limit), sort, order,
    includeNsfw: "true", complete: "true",
  });
  const url = `${config.FRONTEND_API}/coins?${params}`;
  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.coins)) return data.coins;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (err) {
    console.error(`  [coins] Error: ${err.message}`);
    return [];
  }
}

/**
 * Find the best pool for a token on GeckoTerminal.
 */
async function findPool(tokenAddress) {
  const url = `${config.GECKO_API}/networks/${config.GECKO_NETWORK}/tokens/${tokenAddress}/pools?page=1`;
  try {
    const data = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });
    if (!data.data || data.data.length === 0) return null;
    const pool = data.data[0];
    const attrs = pool.attributes;
    return {
      poolAddress: attrs.address,
      poolName: attrs.name || null,
      volumeUsd24h: parseFloat(attrs.volume_usd?.h24) || 0,
      reserveInUsd: parseFloat(attrs.reserve_in_usd) || 0,
    };
  } catch (err) {
    console.error(`  [pool] Error for ${tokenAddress.slice(0, 12)}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch candles for the last N hours from GeckoTerminal.
 */
async function fetchCandles(poolAddress, {
  timeframe = config.DEFAULT_TIMEFRAME,
  aggregate = config.DEFAULT_AGGREGATE,
  currency = config.DEFAULT_CURRENCY,
  hours = config.FETCH_HOURS,
} = {}) {
  let allCandles = [];
  let beforeTimestamp = Math.floor(Date.now() / 1000);
  const cutoffTimestamp = beforeTimestamp - hours * 3600;
  let emptyStreak = 0;

  while (true) {
    const url =
      `${config.GECKO_API}/networks/${config.GECKO_NETWORK}/pools/${poolAddress}/ohlcv/${timeframe}` +
      `?aggregate=${aggregate}&before_timestamp=${beforeTimestamp}&limit=${config.GECKO_LIMIT}&currency=${currency}`;

    let data;
    try {
      data = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });
    } catch (err) {
      if (err.message.includes("404")) break;
      await sleep(5000);
      try {
        data = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });
      } catch { break; }
    }

    const ohlcvList = data?.data?.attributes?.ohlcv_list;
    if (!ohlcvList || ohlcvList.length === 0) {
      emptyStreak++;
      if (emptyStreak >= 3) break;
      const agg = parseInt(aggregate);
      const jump = timeframe === "minute" ? config.GECKO_LIMIT * 60 * agg :
                   timeframe === "hour" ? config.GECKO_LIMIT * 3600 * agg :
                   config.GECKO_LIMIT * 86400 * agg;
      beforeTimestamp -= jump;
      await sleep(config.GECKO_RATE_LIMIT_MS);
      continue;
    }

    emptyStreak = 0;
    const candles = ohlcvList.map((c) => ({
      timestamp: c[0], datetime: new Date(c[0] * 1000).toISOString(),
      open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
    }));

    allCandles.push(...candles);

    const oldestTimestamp = Math.min(...ohlcvList.map((c) => c[0]));
    if (oldestTimestamp <= cutoffTimestamp) break;
    beforeTimestamp = oldestTimestamp - 1;
    if (ohlcvList.length < config.GECKO_LIMIT) break;
    await sleep(config.GECKO_RATE_LIMIT_MS);
  }

  // Sort, dedupe, trim to time window
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set();
  allCandles = allCandles.filter((c) => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return c.timestamp >= cutoffTimestamp;
  });

  return allCandles;
}

/**
 * Full pipeline: fetch top graduated tokens + their candles.
 * Saves raw data to disk.
 */
async function fetchAll(onProgress) {
  const rawDir = config.RAW_DIR;
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

  // Fetch graduated tokens
  const allTokens = [];
  let offset = 0;
  const maxTokens = config.MAX_TOKENS_TO_FETCH;

  while (allTokens.length < maxTokens) {
    const coins = await fetchGraduatedPage({ offset, limit: config.COINS_PER_PAGE });
    if (!coins || coins.length === 0) break;
    allTokens.push(...coins);
    offset += coins.length;
    if (onProgress) onProgress({ phase: "tokens", count: allTokens.length, total: maxTokens });
  }

  const tokens = allTokens.slice(0, maxTokens);
  console.log(`  [fetch] Got ${tokens.length} graduated tokens`);

  const results = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const mint = token.mint;
    if (!mint) continue;

    if (onProgress) onProgress({ phase: "candles", current: i + 1, total: tokens.length, mint });

    // Find pool
    const pool = await findPool(mint);
    if (!pool || pool.volumeUsd24h < config.MIN_VOLUME_24H) {
      console.log(`  [skip] ${mint.slice(0, 12)} — no pool or low volume`);
      continue;
    }

    // Fetch candles
    const candles = await fetchCandles(pool.poolAddress);
    if (candles.length < config.MIN_CANDLES) {
      console.log(`  [skip] ${mint.slice(0, 12)} — only ${candles.length} candles`);
      continue;
    }

    const entry = {
      token: {
        mint,
        name: token.name || token.symbol || mint.slice(0, 12),
        symbol: token.symbol || "",
        poolAddress: pool.poolAddress,
        volumeUsd24h: pool.volumeUsd24h,
        reserveInUsd: pool.reserveInUsd,
      },
      candles,
      fetchedAt: new Date().toISOString(),
      timeframe: `${config.DEFAULT_AGGREGATE}${config.DEFAULT_TIMEFRAME.charAt(0)}`,
    };

    // Save individual token data
    fs.writeFileSync(path.join(rawDir, `${mint}.json`), JSON.stringify(entry, null, 2));
    results.push(entry);
    console.log(`  [ok] ${token.name || mint.slice(0, 12)} — ${candles.length} candles, vol=$${Math.round(pool.volumeUsd24h)}`);
  }

  // Save manifest
  const manifest = {
    fetchedAt: new Date().toISOString(),
    config: { hours: config.FETCH_HOURS, timeframe: config.DEFAULT_TIMEFRAME, aggregate: config.DEFAULT_AGGREGATE },
    tokens: results.map((r) => ({ mint: r.token.mint, name: r.token.name, candles: r.candles.length })),
  };
  fs.writeFileSync(path.join(rawDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

  return results;
}

/**
 * Load previously fetched raw data from disk.
 */
function loadRawData() {
  const rawDir = config.RAW_DIR;
  if (!fs.existsSync(rawDir)) return [];

  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  return files.map((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf8"));
    } catch { return null; }
  }).filter(Boolean);
}

module.exports = { fetchAll, loadRawData, fetchCandles, findPool, fetchGraduatedPage };
