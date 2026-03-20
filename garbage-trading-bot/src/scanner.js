const config = require('./config');
const { fetchJSON, sleep } = require('./api-client');

/**
 * Fetch one page of graduated tokens from pump.fun
 */
async function fetchGraduatedPage({ offset = 0, limit, sort, order } = {}) {
  const l = limit || config.COINS_PER_PAGE;
  const s = sort || config.SCAN_SORT;
  const o = order || config.SCAN_ORDER;
  const url =
    `${config.FRONTEND_API}/coins?offset=${offset}&limit=${l}` +
    `&sort=${s}&order=${o}&includeNsfw=true&complete=true`;
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

    const best = pools[0];
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
async function scanTokens({ onFound, onProgress } = {}) {
  const matched = [];
  let scanned = 0;

  for (let page = 0; page < config.MAX_PAGES_TO_SCAN; page++) {
    const offset = page * config.COINS_PER_PAGE;
    if (onProgress) onProgress({ phase: 'fetching_page', page: page + 1, scanned });

    let coins;
    try {
      coins = await fetchGraduatedPage({ offset });
    } catch (err) {
      console.error(`  [scanner] Failed to fetch page ${page}: ${err.message}`);
      break;
    }

    if (coins.length === 0) break;

    for (const coin of coins) {
      scanned++;

      // Quick pre-filter on pump.fun market cap (rough, may be stale)
      const pumpMcap = coin.usd_market_cap || 0;
      if (pumpMcap > config.MAX_MARKET_CAP_USD * 10) continue; // generous pre-filter

      // Get live pool data from GeckoTerminal
      const pool = await getPoolInfo(coin.mint);
      if (!pool) continue;

      const { volumeUsd24h, marketCapUsd, priceUsd, fdvUsd, poolAddress } = pool;

      // Apply strict filters
      if (volumeUsd24h < config.MIN_DAILY_VOLUME_USD) continue;
      if (marketCapUsd > config.MAX_MARKET_CAP_USD && fdvUsd > config.MAX_MARKET_CAP_USD) continue;

      const effectiveMcap = marketCapUsd || fdvUsd;

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

    if (coins.length < config.COINS_PER_PAGE) break;
  }

  if (onProgress) onProgress({ phase: 'done', scanned, matched: matched.length });
  return matched;
}

module.exports = { scanTokens, getPoolInfo };
