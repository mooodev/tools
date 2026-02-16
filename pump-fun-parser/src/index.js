const config = require("./config");
const storage = require("./storage");
const { paginateCoins, fetchCurrentlyLive, fetchLatestCoins } = require("./token-fetcher");
const { fetchAllTrades, fetchAllCandlesticks, fetchMetadataAndTrades } = require("./trade-fetcher");
const { startLiveCollector } = require("./live-collector");
const { sleep } = require("./api-client");

const MODE = process.argv[2] || "historical";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║       pump.fun Token Parser v1.0         ║");
  console.log("╚══════════════════════════════════════════╝\n");

  storage.initStorage();

  console.log(`Data directory: ${config.DATA_DIR}`);
  console.log(`Existing tokens on disk: ${storage.getTokenCount()}`);
  if (config.JWT_TOKEN) {
    console.log("JWT auth: configured");
  } else {
    console.log("JWT auth: NOT SET");
    console.log("  -> Both trades and candlestick endpoints require JWT authentication.");
    console.log("  -> Without JWT: only token metadata will be collected (no trades, no candlesticks).");
    console.log("  -> Set PUMPFUN_JWT env var for full data (trades + candlesticks).");
    console.log("  -> Tip: open pump.fun in browser, DevTools > Network, copy Authorization header.");
  }
  console.log(`Mode: ${MODE}\n`);

  if (MODE === "live") {
    await runLiveMode();
  } else if (MODE === "historical") {
    await runHistoricalMode();
  } else if (MODE === "both") {
    // Run historical first, then switch to live
    await runHistoricalMode();
    await runLiveMode();
  } else {
    console.log("Usage: node src/index.js [historical|live|both]");
    console.log("  historical - Paginate through existing coins and fetch all their trades");
    console.log("  live       - Stream new tokens in real-time via PumpPortal WebSocket");
    console.log("  both       - Run historical first, then switch to live streaming");
    process.exit(0);
  }
}

/**
 * Historical mode: paginate through coins on pump.fun and fetch all trades for each.
 * Uses multiple sort strategies to maximize coverage.
 */
async function runHistoricalMode() {
  console.log("=== Historical Mode: Fetching existing tokens ===\n");

  const seenMints = new Set();

  // Load state for resumption
  const state = storage.loadState() || { lastOffset: 0, strategy: 0 };

  const strategies = [
    { sort: "created_timestamp", order: "DESC", label: "newest first", complete: null },
    { sort: "created_timestamp", order: "ASC", label: "oldest first", complete: null },
    { sort: "market_cap", order: "DESC", label: "highest market cap", complete: null },
    { sort: "market_cap", order: "DESC", label: "graduated only", complete: true },
    { sort: "market_cap", order: "ASC", label: "lowest market cap", complete: null },
  ];

  // Also fetch currently-live and latest coins
  console.log("[strategy] Fetching currently-live coins...");
  await fetchAndProcessBatch(
    () => fetchCurrentlyLive({ limit: 100 }),
    seenMints
  );

  console.log("[strategy] Fetching latest coins...");
  await fetchAndProcessBatch(
    () => fetchLatestCoins(),
    seenMints
  );

  // Run each sort strategy to cover as many tokens as possible
  for (let i = state.strategy; i < strategies.length; i++) {
    const s = strategies[i];
    console.log(`\n[strategy ${i + 1}/${strategies.length}] ${s.label} (sort=${s.sort}, order=${s.order})...\n`);

    let startOffset = i === state.strategy ? state.lastOffset : 0;
    let currentOffset = startOffset;

    await paginateCoins({
      sort: s.sort,
      order: s.order,
      complete: s.complete,
      maxPages: 0, // unlimited
      onBatch: async (coins) => {
        let newCount = 0;

        for (const coin of coins) {
          if (!coin.mint || seenMints.has(coin.mint)) continue;
          seenMints.add(coin.mint);

          // Skip if already fully saved on disk
          if (storage.tokenExists(coin.mint)) {
            continue;
          }

          newCount++;
          await processToken(coin);
        }

        currentOffset += coins.length;

        // Save state for resumption
        storage.saveState({ lastOffset: currentOffset, strategy: i });

        console.log(
          `  [batch] Processed ${coins.length} coins (${newCount} new). ` +
          `Total unique: ${seenMints.size}. On disk: ${storage.getTokenCount()}`
        );
      },
    });

    // Reset offset for next strategy
    storage.saveState({ lastOffset: 0, strategy: i + 1 });
  }

  console.log(`\n=== Historical fetch complete ===`);
  console.log(`Total unique tokens seen: ${seenMints.size}`);
  console.log(`Total tokens saved to disk: ${storage.getTokenCount()}\n`);
}

/**
 * Fetch a one-shot batch and process it.
 */
async function fetchAndProcessBatch(fetchFn, seenMints) {
  try {
    const coins = await fetchFn();
    if (!coins || coins.length === 0) return;

    for (const coin of coins) {
      if (!coin.mint || seenMints.has(coin.mint)) continue;
      seenMints.add(coin.mint);

      if (storage.tokenExists(coin.mint)) continue;
      await processToken(coin);
    }

    console.log(`  [batch] Got ${coins.length} coins. On disk: ${storage.getTokenCount()}`);
  } catch (err) {
    console.error(`  [batch] Error: ${err.message}`);
  }
}

/**
 * Process a single token: fetch all its trades and save to disk.
 */
async function processToken(coin) {
  const mint = coin.mint;
  const name = coin.name || coin.symbol || mint.slice(0, 8);

  console.log(`\n  Processing: ${name} (${mint.slice(0, 12)}...)`);

  let trades = [];
  let candlesticks = [];
  let advancedData = null;

  if (config.JWT_TOKEN) {
    // JWT provided — fetch individual trades + advanced metadata + candlesticks
    try {
      trades = await fetchAllTrades(mint);
      console.log(`    Trades fetched: ${trades.length}`);
    } catch (err) {
      console.error(`    Error fetching trades: ${err.message}`);
    }

    advancedData = await fetchMetadataAndTrades(mint);

    // Fetch candlestick (OHLCV) data — requires JWT auth
    try {
      candlesticks = await fetchAllCandlesticks(mint);
      console.log(`    Candlesticks fetched: ${candlesticks.length}`);
    } catch (err) {
      console.error(`    Error fetching candlesticks: ${err.message}`);
    }
  } else {
    // No JWT — trades and candlesticks both require auth
    console.log(`    Skipping trades and candlesticks (no JWT configured).`);
  }

  // Build comprehensive token record
  const tokenRecord = {
    // Core identity
    mint: coin.mint,
    name: coin.name || null,
    symbol: coin.symbol || null,
    description: coin.description || null,
    image_uri: coin.image_uri || null,
    metadata_uri: coin.metadata_uri || null,

    // Social links
    twitter: coin.twitter || null,
    telegram: coin.telegram || null,
    website: coin.website || null,

    // Creator info
    creator: coin.creator || null,
    created_timestamp: coin.created_timestamp || null,

    // Bonding curve data
    bonding_curve: coin.bonding_curve || null,
    virtual_sol_reserves: coin.virtual_sol_reserves || null,
    virtual_token_reserves: coin.virtual_token_reserves || null,
    total_supply: coin.total_supply || null,

    // Market data
    market_cap: coin.market_cap || null,
    usd_market_cap: coin.usd_market_cap || null,

    // Graduation status
    // "complete" field from pump.fun API = graduated (bonding curve fully sold)
    graduated: coin.complete === true || coin.complete === "true",
    raydium_pool: coin.raydium_pool || null,

    // Flags
    nsfw: coin.nsfw || false,
    is_currently_live: coin.is_currently_live || false,
    king_of_the_hill_timestamp: coin.king_of_the_hill_timestamp || null,

    // Reply/comment count
    reply_count: coin.reply_count || 0,

    // Last trade timestamp
    last_trade_timestamp: coin.last_trade_timestamp || null,

    // All trading data (individual trades — requires JWT)
    trades_count: trades.length,
    trades: trades.map(normalizeTrade),

    // Candlestick / OHLCV data (price + volume history — requires JWT auth)
    candlesticks_count: candlesticks.length,
    candlesticks,

    // Advanced API data (if available)
    advanced_metadata: advancedData || null,

    // All raw fields from the API that we might not have mapped above
    raw_coin_data: coin,

    // Metadata
    last_updated: new Date().toISOString(),
    data_source: "pumpfun_historical",
  };

  storage.saveToken(tokenRecord);
}

/**
 * Normalize a trade object to a consistent structure.
 */
function normalizeTrade(trade) {
  return {
    signature: trade.signature || null,
    mint: trade.mint || null,
    type: trade.is_buy === true ? "buy" : trade.is_buy === false ? "sell" : (trade.type || trade.txType || null),
    sol_amount: trade.sol_amount || trade.solAmount || null,
    token_amount: trade.token_amount || trade.tokenAmount || null,
    user: trade.user || trade.traderPublicKey || trade.trader || null,
    timestamp: trade.timestamp || null,
    slot: trade.slot || null,
    tx_index: trade.tx_index || null,
    bonding_curve_key: trade.bonding_curve_key || trade.bondingCurveKey || null,
    virtual_sol_reserves: trade.virtual_sol_reserves || trade.vSolInBondingCurve || null,
    virtual_token_reserves: trade.virtual_token_reserves || trade.vTokensInBondingCurve || null,
    market_cap_sol: trade.market_cap_sol || trade.marketCapSol || null,
    raw: trade,
  };
}

/**
 * Live mode: stream new tokens in real-time.
 */
async function runLiveMode() {
  await startLiveCollector({
    tradeDelaySec: 60,
    subscribeTrades: true,
  });
}

// Run
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
