const config = require("./config");
const storage = require("./storage");
const { paginateGraduated } = require("./token-fetcher");
const { findPool, fetchAllCandles } = require("./candle-fetcher");
const { sleep } = require("./api-client");

async function main() {
  console.log("======================================================");
  console.log("  Graduated Token Parser + Candlestick Fetcher");
  console.log("  Tokens: pump.fun API (graduated only)");
  console.log("  Candles: GeckoTerminal API (free, no key needed)");
  console.log("======================================================\n");

  storage.initStorage();

  console.log(`Data directory:  ${config.DATA_DIR}`);
  console.log(`Tokens on disk:  ${storage.getTokenCount()}`);
  console.log(`Candles on disk: ${storage.getCandleCount()}\n`);

  const seenMints = new Set();
  const state = storage.loadState() || { lastOffset: 0, strategy: 0 };

  const strategies = [
    { sort: "market_cap", order: "DESC", label: "highest market cap" },
    { sort: "market_cap", order: "ASC", label: "lowest market cap" },
    { sort: "created_timestamp", order: "DESC", label: "newest first" },
    { sort: "created_timestamp", order: "ASC", label: "oldest first" },
  ];

  for (let i = state.strategy; i < strategies.length; i++) {
    const s = strategies[i];
    console.log(`\n[strategy ${i + 1}/${strategies.length}] ${s.label} (sort=${s.sort}, order=${s.order})\n`);

    let startOffset = i === state.strategy ? state.lastOffset : 0;
    let currentOffset = startOffset;

    await paginateGraduated({
      sort: s.sort,
      order: s.order,
      maxPages: 0,
      onBatch: async (coins) => {
        let newCount = 0;

        for (const coin of coins) {
          if (!coin.mint || seenMints.has(coin.mint)) continue;
          seenMints.add(coin.mint);

          if (storage.tokenExists(coin.mint) && storage.candlesExist(coin.mint)) {
            continue;
          }

          newCount++;
          await processGraduatedToken(coin);
        }

        currentOffset += coins.length;
        storage.saveState({ lastOffset: currentOffset, strategy: i });

        console.log(
          `  [batch] Processed ${coins.length} coins (${newCount} new). ` +
          `Total unique: ${seenMints.size}. Tokens: ${storage.getTokenCount()}. Candles: ${storage.getCandleCount()}`
        );
      },
    });

    storage.saveState({ lastOffset: 0, strategy: i + 1 });
  }

  console.log(`\n=== Done ===`);
  console.log(`Total unique graduated tokens seen: ${seenMints.size}`);
  console.log(`Token files on disk:  ${storage.getTokenCount()}`);
  console.log(`Candle files on disk: ${storage.getCandleCount()}\n`);
}

async function processGraduatedToken(coin) {
  const mint = coin.mint;
  const name = coin.name || coin.symbol || mint.slice(0, 8);

  console.log(`\n  Processing: ${name} (${mint.slice(0, 12)}...)`);

  // Save token metadata
  if (!storage.tokenExists(mint)) {
    const tokenRecord = {
      mint: coin.mint,
      name: coin.name || null,
      symbol: coin.symbol || null,
      description: coin.description || null,
      image_uri: coin.image_uri || null,
      metadata_uri: coin.metadata_uri || null,
      twitter: coin.twitter || null,
      telegram: coin.telegram || null,
      website: coin.website || null,
      creator: coin.creator || null,
      created_timestamp: coin.created_timestamp || null,
      bonding_curve: coin.bonding_curve || null,
      total_supply: coin.total_supply || null,
      market_cap: coin.market_cap || null,
      usd_market_cap: coin.usd_market_cap || null,
      graduated: true,
      raydium_pool: coin.raydium_pool || null,
      king_of_the_hill_timestamp: coin.king_of_the_hill_timestamp || null,
      last_trade_timestamp: coin.last_trade_timestamp || null,
      last_updated: new Date().toISOString(),
    };

    storage.saveToken(tokenRecord);
    console.log(`    Token metadata saved.`);
  }

  // Fetch candlestick data via GeckoTerminal
  if (!storage.candlesExist(mint)) {
    const poolInfo = await findPool(mint);

    if (!poolInfo) {
      console.log(`    No pool found on GeckoTerminal — skipping candles.`);
      return;
    }

    console.log(`    Pool: ${poolInfo.poolName} (${poolInfo.poolAddress.slice(0, 12)}...)`);

    const candles = await fetchAllCandles(poolInfo.poolAddress);

    if (candles.length === 0) {
      console.log(`    No candle data available.`);
      return;
    }

    const candleRecord = {
      meta: {
        tokenAddress: mint,
        tokenName: name,
        poolAddress: poolInfo.poolAddress,
        poolName: poolInfo.poolName,
        network: config.GECKO_NETWORK,
        timeframe: config.DEFAULT_TIMEFRAME,
        aggregate: parseInt(config.DEFAULT_AGGREGATE),
        currency: config.DEFAULT_CURRENCY,
        totalCandles: candles.length,
        fetchedAt: new Date().toISOString(),
        rangeStart: candles[0]?.datetime || null,
        rangeEnd: candles[candles.length - 1]?.datetime || null,
      },
      candles,
    };

    storage.saveCandles(mint, candleRecord);

    const days = candles.length > 1
      ? ((candles[candles.length - 1].timestamp - candles[0].timestamp) / 86400).toFixed(1)
      : "0";
    console.log(`    Saved ${candles.length} candles (${days} days of data).`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
