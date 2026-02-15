const config = require("./config");
const { fetchJSON } = require("./api-client");

/**
 * Fetch a page of coins from pump.fun.
 *
 * Tries multiple sort strategies to maximize coverage:
 *   - created_timestamp: newest first (default)
 *   - market_cap: highest market cap first
 *
 * @param {object} options
 * @param {number} options.offset - Pagination offset
 * @param {number} options.limit - Number of coins per page
 * @param {string} options.sort - Sort field (market_cap, created_timestamp, etc.)
 * @param {string} options.order - ASC or DESC
 * @param {boolean} options.includeNsfw - Include NSFW tokens
 * @param {boolean|null} options.complete - null=all, true=graduated, false=not graduated
 * @returns {Promise<Array>} Array of coin objects
 */
async function fetchCoinsPage({
  offset = 0,
  limit = config.COINS_PER_PAGE,
  sort = "created_timestamp",
  order = "DESC",
  includeNsfw = true,
  complete = null,
} = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    sort,
    order,
    includeNsfw: String(includeNsfw),
  });

  if (complete !== null) {
    params.set("complete", String(complete));
  }

  const url = `${config.FRONTEND_API}/coins?${params}`;
  console.log(`  [coins] Fetching offset=${offset} sort=${sort} order=${order}`);

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.coins)) return data.coins;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (err) {
    console.error(`  [coins] Error fetching page: ${err.message}`);
    return [];
  }
}

/**
 * Fetch currently live coins.
 */
async function fetchCurrentlyLive({
  offset = 0,
  limit = config.COINS_PER_PAGE,
  includeNsfw = true,
} = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    includeNsfw: String(includeNsfw),
    order: "DESC",
  });

  const url = `${config.FRONTEND_API}/coins/currently-live?${params}`;
  console.log(`  [live] Fetching currently-live offset=${offset}`);

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.coins)) return data.coins;
    return [];
  } catch (err) {
    console.error(`  [live] Error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch latest coins.
 */
async function fetchLatestCoins() {
  const url = `${config.FRONTEND_API}/coins/latest`;
  console.log(`  [latest] Fetching latest coins`);

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    return [];
  } catch (err) {
    console.error(`  [latest] Error: ${err.message}`);
    return [];
  }
}

/**
 * Paginate through all coins using a given sort strategy.
 * Yields batches of coins via a callback.
 *
 * @param {object} options
 * @param {string} options.sort
 * @param {string} options.order
 * @param {boolean|null} options.complete
 * @param {number} options.maxPages - Max pages to fetch (0 = unlimited)
 * @param {function} onBatch - Callback receiving an array of coins
 */
async function paginateCoins({
  sort = "created_timestamp",
  order = "DESC",
  complete = null,
  maxPages = 0,
  onBatch,
}) {
  let offset = 0;
  let page = 0;

  while (true) {
    const coins = await fetchCoinsPage({
      offset,
      limit: config.COINS_PER_PAGE,
      sort,
      order,
      complete,
    });

    if (!coins || coins.length === 0) {
      console.log(`  [paginate] No more coins at offset=${offset}. Done.`);
      break;
    }

    await onBatch(coins);
    offset += coins.length;
    page++;

    if (maxPages > 0 && page >= maxPages) {
      console.log(`  [paginate] Reached max pages (${maxPages}). Stopping.`);
      break;
    }
  }
}

module.exports = {
  fetchCoinsPage,
  fetchCurrentlyLive,
  fetchLatestCoins,
  paginateCoins,
};
