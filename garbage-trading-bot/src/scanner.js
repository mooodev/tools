const config = require('./config');
const { fetchJSON, sleep } = require('./api-client');

/**
 * Fetch one page of graduated tokens from pump.fun
 */
async function fetchGraduatedPage({ offset = 0, limit, sort, order } = {}) {
  const l = limit || config.COINS_PER_PAGE;
  const s = sort || config.SCAN_SORT;
  const o = order || config.SCAN_ORDER;
  const isGraduated = (config.TOKEN_FILTER || 'graduated') === 'graduated';
  const params = new URLSearchParams({
    offset: String(offset), limit: String(l), sort: s, order: o,
    includeNsfw: 'true',
    ...(isGraduated ? { complete: 'true' } : {}),
  });
  const url = `${config.FRONTEND_API}/coins?${params}`;
  const coins = await fetchJSON(url);
  return Array.isArray(coins) ? coins : [];
}

/**
 * Look up a token's best pool on GeckoTerminal.
 * Returns { poolAddress, volumeUsd24h, reserveInUsd, priceUsd } or null.
 */
async function getPoolInfo(mintAddress) {
  const url = `${config.GECKO_API}/networks/${config.GECKO_NETWORK}/tokens/${mintAddress}/pools?page=1`;
  try {
    const resp = await fetchJSON(url, { rateLimitMs: config.GECKO_RATE_LIMIT_MS });
    const pools = resp?.data;
    if (!pools || pools.length === 0) return null;

    // Pick pool with highest 24h volume instead of relying on default sort
    const best = pools.reduce((a, b) => {
      const volA = parseFloat(a.attributes?.volume_usd?.h24 || '0');
      const volB = parseFloat(b.attributes?.volume_usd?.h24 || '0');
      return volB > volA ? b : a;
    });
    const attr = best.attributes;
    return {
      poolAddress: attr.address,
      volumeUsd24h: parseFloat(attr.volume_usd?.h24 || '0'),
      reserveInUsd: parseFloat(attr.reserve_in_usd || '0'),
      priceUsd: parseFloat(attr.base_token_price_usd || '0'),
      fdvUsd: parseFloat(attr.fdv_usd || '0'),
      marketCapUsd: parseFloat(attr.market_cap_usd || attr.fdv_usd || '0'),
    };
  } catch (err) {
    console.warn(`  [scanner] Pool lookup failed for ${mintAddress}: ${err.message}`);
    return null;
  }
}

/**
 * Scan graduated tokens and return those matching the filter criteria:
 *  - 24h volume > MIN_DAILY_VOLUME_USD
 *  - current market cap < MAX_MARKET_CAP_USD
 *
 * Yields results via onFound(token) callback.
 * Returns the full list of matched tokens.
 */
async function scanTokens({ onFound, onProgress, onLog } = {}) {
  const matched = [];
  let scanned = 0;
  let skippedPumpMcap = 0;
  let skippedNoPool = 0;
  let skippedLowVolume = 0;
  let skippedHighMcap = 0;

  const log = (msg, level = 'info') => {
    console.log(`  [scanner] ${msg}`);
    if (onLog) onLog(msg, level);
  };

  log(`Search started — filters: minVol=$${config.MIN_DAILY_VOLUME_USD.toLocaleString()}, maxMcap=$${config.MAX_MARKET_CAP_USD.toLocaleString()}, pages=${config.MAX_PAGES_TO_SCAN}, sort=${config.SCAN_SORT} ${config.SCAN_ORDER}`);

  for (let page = 0; page < config.MAX_PAGES_TO_SCAN; page++) {
    const offset = page * config.COINS_PER_PAGE;
    if (onProgress) onProgress({ phase: 'fetching_page', page: page + 1, scanned });

    log(`Fetching page ${page + 1}/${config.MAX_PAGES_TO_SCAN} (offset ${offset})...`);

    let coins;
    try {
      coins = await fetchGraduatedPage({ offset });
    } catch (err) {
      log(`Failed to fetch page ${page + 1}: ${err.message}`, 'err');
      break;
    }

    if (coins.length === 0) {
      log(`Page ${page + 1} returned 0 coins — end of results`);
      break;
    }

    log(`Page ${page + 1}: got ${coins.length} coins, evaluating...`);

    for (const coin of coins) {
      scanned++;

      // Quick pre-filter on pump.fun market cap (rough, may be stale)
      // Note: listing endpoint returns "market_cap" (not "usd_market_cap")
      const pumpMcap = coin.market_cap || 0;
      if (pumpMcap > config.MAX_MARKET_CAP_USD * 10) {
        log(`SKIP ${coin.symbol || coin.mint.slice(0, 8)} — pump mcap $${pumpMcap.toFixed(0)} exceeds pre-filter ($${(config.MAX_MARKET_CAP_USD * 10).toLocaleString()})`, 'skip');
        skippedPumpMcap++;
        continue;
      }

      // Get live pool data from GeckoTerminal
      log(`Checking ${coin.symbol || coin.mint.slice(0, 8)} (pump mcap: $${pumpMcap.toFixed(0)})...`);
      const pool = await getPoolInfo(coin.mint);
      if (!pool) {
        log(`SKIP ${coin.symbol || coin.mint.slice(0, 8)} — no pool data found on GeckoTerminal`, 'skip');
        skippedNoPool++;
        continue;
      }

      const { volumeUsd24h, marketCapUsd, priceUsd, fdvUsd, poolAddress } = pool;

      // Apply strict filters
      if (volumeUsd24h < config.MIN_DAILY_VOLUME_USD) {
        log(`SKIP ${coin.symbol} — volume $${volumeUsd24h.toFixed(0)} < min $${config.MIN_DAILY_VOLUME_USD.toLocaleString()}`, 'skip');
        skippedLowVolume++;
        continue;
      }
      if (marketCapUsd > config.MAX_MARKET_CAP_USD && fdvUsd > config.MAX_MARKET_CAP_USD) {
        log(`SKIP ${coin.symbol} — mcap $${marketCapUsd.toFixed(0)} & fdv $${fdvUsd.toFixed(0)} both exceed max $${config.MAX_MARKET_CAP_USD.toLocaleString()}`, 'skip');
        skippedHighMcap++;
        continue;
      }

      const effectiveMcap = marketCapUsd || fdvUsd;

      log(`MATCH ${coin.symbol} — mcap: $${effectiveMcap.toFixed(2)}, vol: $${volumeUsd24h.toFixed(0)}, price: $${priceUsd}`, 'match');

      const token = {
        mint: coin.mint,
        name: coin.name,
        symbol: coin.symbol,
        poolAddress,
        priceUsd,
        marketCapUsd: effectiveMcap,
        volumeUsd24h,
        pumpMcap: pumpMcap,
        creator: coin.creator,
        createdAt: coin.created_timestamp
          ? new Date(coin.created_timestamp * 1000).toISOString()
          : null,
        imageUri: coin.image_uri || null,
      };

      matched.push(token);
      if (onFound) onFound(token);
    }

    if (coins.length < config.COINS_PER_PAGE) {
      log(`Page ${page + 1} had fewer coins than expected (${coins.length}/${config.COINS_PER_PAGE}) — no more pages`);
      break;
    }
  }

  log(`Search finished — scanned: ${scanned}, matched: ${matched.length}, skipped: ${skippedPumpMcap} pump-mcap, ${skippedNoPool} no-pool, ${skippedLowVolume} low-vol, ${skippedHighMcap} high-mcap`);
  if (onProgress) onProgress({ phase: 'done', scanned, matched: matched.length });
  return matched;
}

module.exports = { scanTokens, getPoolInfo };
