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
  const isGraduated = (config.TOKEN_FILTER || "graduated") === "graduated";
  const params = new URLSearchParams({
    offset: String(offset), limit: String(limit), sort, order,
    includeNsfw: "true",
    ...(isGraduated ? { complete: "true" } : {}),
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
 * Apply token filters (market cap, volume, graduation status).
 */
function applyTokenFilters(tokens) {
  let filtered = tokens;

  // Market cap filter
  const minMcap = config.MIN_MARKET_CAP || 0;
  if (minMcap > 0) {
    filtered = filtered.filter((t) => {
      const mcap = t.usd_market_cap || t.market_cap || 0;
      return mcap >= minMcap;
    });
  }

  return filtered;
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

  // Apply filters
  const filtered = applyTokenFilters(allTokens);
  const tokens = filtered.slice(0, maxTokens);
  console.log(`  [fetch] Got ${allTokens.length} tokens, ${tokens.length} after filters`);

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
        marketCap: token.usd_market_cap || token.market_cap || 0,
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
 * Update existing token data — only fetch candles that are not yet downloaded.
 * Reads existing data from disk, finds the latest timestamp, and fetches only newer candles.
 */
async function updateTokenData(onProgress) {
  const rawDir = config.RAW_DIR;
  if (!fs.existsSync(rawDir)) {
    console.log("  [update] No existing data — running full fetch instead");
    return fetchAll(onProgress);
  }

  const existingData = loadRawData();
  if (existingData.length === 0) {
    console.log("  [update] No existing token files — running full fetch instead");
    return fetchAll(onProgress);
  }

  console.log(`  [update] Updating ${existingData.length} existing tokens`);
  const results = [];
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < existingData.length; i++) {
    const data = existingData[i];
    const mint = data.token?.mint;
    if (!mint) continue;

    if (onProgress) onProgress({ phase: "candles", current: i + 1, total: existingData.length, mint });

    const poolAddress = data.token?.poolAddress;
    if (!poolAddress) {
      console.log(`  [skip] ${mint.slice(0, 12)} — no pool address stored`);
      skipped++;
      continue;
    }

    // Find the latest candle timestamp in existing data
    const existingCandles = data.candles || [];
    const latestTimestamp = existingCandles.length > 0
      ? Math.max(...existingCandles.map((c) => c.timestamp))
      : 0;

    if (latestTimestamp === 0) {
      console.log(`  [skip] ${mint.slice(0, 12)} — no existing candles`);
      skipped++;
      continue;
    }

    // Fetch only new candles (from latest existing timestamp onwards)
    const nowTs = Math.floor(Date.now() / 1000);
    const hoursSinceLastCandle = (nowTs - latestTimestamp) / 3600;

    if (hoursSinceLastCandle < 0.02) { // Less than ~1 minute ago
      console.log(`  [skip] ${mint.slice(0, 12)} — already up to date`);
      skipped++;
      results.push(data);
      continue;
    }

    // Fetch new candles with a small overlap to avoid gaps
    const fetchHours = Math.min(Math.ceil(hoursSinceLastCandle) + 1, config.FETCH_HOURS);
    const newCandles = await fetchCandles(poolAddress, { hours: fetchHours });

    if (newCandles.length === 0) {
      console.log(`  [skip] ${mint.slice(0, 12)} — no new candles available`);
      results.push(data);
      continue;
    }

    // Merge: keep existing candles + add truly new ones (dedup by timestamp)
    const existingSet = new Set(existingCandles.map((c) => c.timestamp));
    const genuinelyNew = newCandles.filter((c) => !existingSet.has(c.timestamp));

    const mergedCandles = [...existingCandles, ...genuinelyNew]
      .sort((a, b) => a.timestamp - b.timestamp);

    // Trim to configured time window
    const cutoff = nowTs - config.FETCH_HOURS * 3600;
    const trimmedCandles = mergedCandles.filter((c) => c.timestamp >= cutoff);

    const entry = {
      ...data,
      candles: trimmedCandles,
      fetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(rawDir, `${mint}.json`), JSON.stringify(entry, null, 2));
    results.push(entry);
    updated++;
    console.log(`  [updated] ${data.token.name || mint.slice(0, 12)} — +${genuinelyNew.length} new candles (total: ${trimmedCandles.length})`);
  }

  // Update manifest
  const manifest = {
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: { hours: config.FETCH_HOURS, timeframe: config.DEFAULT_TIMEFRAME, aggregate: config.DEFAULT_AGGREGATE },
    tokens: results.map((r) => ({ mint: r.token.mint, name: r.token.name, candles: r.candles.length })),
  };
  fs.writeFileSync(path.join(rawDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

  if (onProgress) onProgress({ phase: "done", tokens: results.length, updated, skipped });
  console.log(`  [update] Done: ${updated} updated, ${skipped} skipped, ${results.length} total`);

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

/**
 * Update candle data for specific tokens by mint address.
 * Used to incrementally refresh buy-signal tokens.
 */
async function updateSpecificTokens(mints, onProgress) {
  const rawDir = config.RAW_DIR;
  if (!fs.existsSync(rawDir)) {
    return { updated: 0, newCandles: 0, error: "No existing data directory" };
  }

  let updated = 0;
  let totalNewCandles = 0;

  for (let i = 0; i < mints.length; i++) {
    const mint = mints[i];
    const filePath = path.join(rawDir, `${mint}.json`);

    if (!fs.existsSync(filePath)) {
      console.log(`  [skip] ${mint.slice(0, 12)} — no existing data file`);
      continue;
    }

    if (onProgress) onProgress({ phase: "candles", current: i + 1, total: mints.length, mint });

    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }

    const poolAddress = data.token?.poolAddress;
    if (!poolAddress) continue;

    const existingCandles = data.candles || [];
    const latestTimestamp = existingCandles.length > 0
      ? Math.max(...existingCandles.map((c) => c.timestamp))
      : 0;

    if (latestTimestamp === 0) continue;

    const nowTs = Math.floor(Date.now() / 1000);
    const hoursSinceLastCandle = (nowTs - latestTimestamp) / 3600;

    if (hoursSinceLastCandle < 0.02) {
      console.log(`  [skip] ${mint.slice(0, 12)} — already up to date`);
      continue;
    }

    const fetchHours = Math.min(Math.ceil(hoursSinceLastCandle) + 1, config.FETCH_HOURS);
    const newCandles = await fetchCandles(poolAddress, { hours: fetchHours });

    if (newCandles.length === 0) continue;

    const existingSet = new Set(existingCandles.map((c) => c.timestamp));
    const genuinelyNew = newCandles.filter((c) => !existingSet.has(c.timestamp));

    const mergedCandles = [...existingCandles, ...genuinelyNew]
      .sort((a, b) => a.timestamp - b.timestamp);

    const cutoff = nowTs - config.FETCH_HOURS * 3600;
    const trimmedCandles = mergedCandles.filter((c) => c.timestamp >= cutoff);

    const entry = {
      ...data,
      candles: trimmedCandles,
      fetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
    updated++;
    totalNewCandles += genuinelyNew.length;
    console.log(`  [updated] ${(data.token.name || mint).slice(0, 20)} — +${genuinelyNew.length} new candles`);
  }

  return { updated, newCandles: totalNewCandles };
}

module.exports = { fetchAll, updateTokenData, updateSpecificTokens, loadRawData, fetchCandles, findPool, fetchGraduatedPage };
