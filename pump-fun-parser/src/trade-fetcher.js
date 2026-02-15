const config = require("./config");
const { fetchJSON } = require("./api-client");

/**
 * Fetch a page of trades for a token.
 *
 * @param {string} mint - Token mint address
 * @param {number} offset - Pagination offset
 * @param {number} limit - Trades per page
 * @returns {Promise<Array>} Array of trade objects
 */
async function fetchTradesPage(mint, offset = 0, limit = config.TRADES_PER_PAGE) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const url = `${config.FRONTEND_API}/trades/all/${mint}?${params}`;

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.trades)) return data.trades;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (err) {
    console.error(`  [trades] Error for ${mint}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch ALL trades for a token by paginating through all pages.
 *
 * @param {string} mint - Token mint address
 * @returns {Promise<Array>} All trades
 */
async function fetchAllTrades(mint) {
  const allTrades = [];
  let offset = 0;
  let page = 0;

  while (page < config.MAX_TRADE_PAGES) {
    const trades = await fetchTradesPage(mint, offset);

    if (!trades || trades.length === 0) break;

    allTrades.push(...trades);
    offset += trades.length;
    page++;

    // If we got fewer than the limit, we've reached the end
    if (trades.length < config.TRADES_PER_PAGE) break;
  }

  return allTrades;
}

/**
 * Fetch combined metadata and trades from the advanced API.
 *
 * @param {string} mint - Token mint address
 * @returns {Promise<object|null>}
 */
async function fetchMetadataAndTrades(mint) {
  const url = `${config.ADVANCED_API}/coins/metadata-and-trades/${mint}`;

  try {
    return await fetchJSON(url);
  } catch (err) {
    console.error(`  [meta+trades] Error for ${mint}: ${err.message}`);
    return null;
  }
}

module.exports = {
  fetchTradesPage,
  fetchAllTrades,
  fetchMetadataAndTrades,
};
