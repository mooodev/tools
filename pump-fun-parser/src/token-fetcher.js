const config = require("./config");
const { fetchJSON } = require("./api-client");

/**
 * Fetch a page of graduated tokens from pump.fun.
 * Only returns tokens where complete=true (bonding curve fully sold, migrated to DEX).
 */
async function fetchGraduatedPage({
  offset = 0,
  limit = config.COINS_PER_PAGE,
  sort = "market_cap",
  order = "DESC",
} = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    sort,
    order,
    includeNsfw: "true",
    complete: "true",
  });

  const url = `${config.FRONTEND_API}/coins?${params}`;
  console.log(`  [coins] Fetching graduated offset=${offset} sort=${sort} order=${order}`);

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
 * Paginate through all graduated tokens.
 * Calls onBatch with each page of coins.
 */
async function paginateGraduated({
  sort = "market_cap",
  order = "DESC",
  maxPages = 0,
  onBatch,
}) {
  let offset = 0;
  let page = 0;

  while (true) {
    const coins = await fetchGraduatedPage({ offset, sort, order });

    if (!coins || coins.length === 0) {
      console.log(`  [paginate] No more graduated tokens at offset=${offset}. Done.`);
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

module.exports = { fetchGraduatedPage, paginateGraduated };
