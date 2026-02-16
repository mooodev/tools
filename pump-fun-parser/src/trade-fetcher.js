const config = require("./config");
const { fetchJSON } = require("./api-client");

/**
 * Fetch a page of trades for a token.
 * Requires JWT auth — will return [] without it.
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
    minimumSize: "0",
  });

  const url = `${config.FRONTEND_API}/trades/all/${mint}?${params}`;

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.trades)) return data.trades;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (err) {
    // Don't spam logs for expected auth failures
    if (/HTTP (401|403|404)/.test(err.message)) {
      return [];
    }
    console.error(`  [trades] Error for ${mint.slice(0, 12)}: ${err.message}`);
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
 * Fetch candlestick (OHLCV) data for a token.
 * This endpoint may work without JWT and provides price/volume history.
 *
 * @param {string} mint - Token mint address
 * @returns {Promise<Array>} Candlestick data
 */
async function fetchCandlesticks(mint) {
  const url = `${config.FRONTEND_API}/candlesticks/${mint}?offset=0&limit=1000&timeframe=1`;

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    return [];
  } catch (err) {
    if (!/HTTP (401|403|404)/.test(err.message)) {
      console.error(`  [candles] Error for ${mint.slice(0, 12)}: ${err.message}`);
    }
    return [];
  }
}

/**
 * Fetch combined metadata and trades from the advanced API.
 * Often requires auth — silently returns null on failure.
 *
 * @param {string} mint - Token mint address
 * @returns {Promise<object|null>}
 */
async function fetchMetadataAndTrades(mint) {
  const url = `${config.ADVANCED_API}/coins/metadata-and-trades/${mint}`;

  try {
    return await fetchJSON(url);
  } catch {
    return null;
  }
}

module.exports = {
  fetchTradesPage,
  fetchAllTrades,
  fetchCandlesticks,
  fetchMetadataAndTrades,
};
