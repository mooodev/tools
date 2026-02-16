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
 * Fetch a single page of candlestick (OHLCV) data for a token.
 * Requires JWT authentication on the v3 API.
 *
 * @param {string} mint - Token mint address
 * @param {number} offset - Pagination offset
 * @param {number} limit - Candlesticks per page
 * @returns {Promise<Array>} Candlestick data
 */
async function fetchCandlesticksPage(mint, offset = 0, limit = config.CANDLES_PER_PAGE) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    timeframe: "1",
  });

  const url = `${config.FRONTEND_API}/candlesticks/${mint}?${params}`;

  try {
    const data = await fetchJSON(url);
    if (Array.isArray(data)) return data;
    return [];
  } catch (err) {
    if (/HTTP (401|403)/.test(err.message)) {
      if (!config.JWT_TOKEN) {
        console.warn(`  [candles] Auth required for candlesticks — set PUMPFUN_JWT env var`);
      } else {
        console.warn(`  [candles] Auth failed for ${mint.slice(0, 12)} — JWT may be expired`);
      }
    } else if (!/HTTP 404/.test(err.message)) {
      console.error(`  [candles] Error for ${mint.slice(0, 12)}: ${err.message}`);
    }
    return [];
  }
}

/**
 * Fetch ALL candlestick (OHLCV) data for a token by paginating through all pages.
 * Requires JWT authentication.
 *
 * @param {string} mint - Token mint address
 * @returns {Promise<Array>} All candlestick data
 */
async function fetchAllCandlesticks(mint) {
  const allCandles = [];
  let offset = 0;
  let page = 0;

  while (page < config.MAX_CANDLE_PAGES) {
    const candles = await fetchCandlesticksPage(mint, offset);

    if (!candles || candles.length === 0) break;

    allCandles.push(...candles);
    offset += candles.length;
    page++;

    // If we got fewer than the limit, we've reached the end
    if (candles.length < config.CANDLES_PER_PAGE) break;
  }

  return allCandles;
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
  fetchCandlesticksPage,
  fetchAllCandlesticks,
  fetchMetadataAndTrades,
};
