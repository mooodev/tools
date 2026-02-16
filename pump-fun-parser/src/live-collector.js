const WebSocket = require("ws");
const config = require("./config");
const storage = require("./storage");
const { fetchAllTrades, fetchCandlesticks } = require("./trade-fetcher");
const { sleep } = require("./api-client");

/**
 * Connect to PumpPortal WebSocket and stream new tokens + trades in real-time.
 * This is free and requires no API key.
 *
 * For each new token discovered, it fetches all trades after a short delay
 * (to let some trades accumulate) and saves the full data to a JSON file.
 *
 * @param {object} options
 * @param {number} options.tradeDelaySec - Seconds to wait before fetching trades for a new token
 * @param {boolean} options.subscribeTrades - Also subscribe to trade events for discovered tokens
 */
async function startLiveCollector({
  tradeDelaySec = 60,
  subscribeTrades = true,
} = {}) {
  console.log("\n=== Live Collector (PumpPortal WebSocket) ===");
  console.log(`Connecting to ${config.PUMPPORTAL_WS}...\n`);

  const ws = new WebSocket(config.PUMPPORTAL_WS);
  const pendingTokens = new Map(); // mint -> token creation data
  const tokenTrades = new Map(); // mint -> array of trade events

  ws.on("open", () => {
    console.log("[ws] Connected. Subscribing to new tokens and migrations...");

    // Subscribe to new token creation events
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));

    // Subscribe to migration/graduation events
    ws.send(JSON.stringify({ method: "subscribeMigration" }));
  });

  ws.on("message", async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      // New token created
      if (msg.txType === "create" || msg.mint) {
        handleNewToken(msg, pendingTokens, tokenTrades, ws, subscribeTrades, tradeDelaySec);
      }

      // Trade event
      if (msg.txType === "buy" || msg.txType === "sell") {
        handleTrade(msg, tokenTrades);
      }

      // Migration/graduation event
      if (msg.txType === "migrate" || msg.txType === "migration") {
        handleMigration(msg);
      }
    } catch (err) {
      // Ignore parse errors from non-JSON messages
    }
  });

  ws.on("error", (err) => {
    console.error(`[ws] Error: ${err.message}`);
  });

  ws.on("close", (code, reason) => {
    console.log(`[ws] Disconnected (code=${code}). Reconnecting in 5s...`);
    setTimeout(() => startLiveCollector({ tradeDelaySec, subscribeTrades }), 5000);
  });

  // Periodically save tokens that have accumulated enough trade data
  const saveInterval = setInterval(async () => {
    await saveAccumulatedTokens(pendingTokens, tokenTrades);
  }, tradeDelaySec * 1000);

  // Cleanup on process exit
  process.on("SIGINT", () => {
    console.log("\n[ws] Shutting down...");
    clearInterval(saveInterval);
    ws.close();
    // Save any remaining data
    saveAccumulatedTokens(pendingTokens, tokenTrades).then(() => process.exit(0));
  });
}

function handleNewToken(msg, pendingTokens, tokenTrades, ws, subscribeTrades, tradeDelaySec) {
  const mint = msg.mint;
  if (!mint || pendingTokens.has(mint)) return;

  console.log(
    `[new] Token: ${msg.name || msg.symbol || mint} (${mint.slice(0, 8)}...)`
  );

  pendingTokens.set(mint, {
    mint,
    name: msg.name || null,
    symbol: msg.symbol || null,
    uri: msg.uri || msg.metadataUri || null,
    bonding_curve: msg.bondingCurveKey || null,
    creator: msg.traderPublicKey || msg.creator || null,
    created_timestamp: msg.timestamp || Date.now(),
    initial_buy_sol: msg.initialBuy || null,
    market_cap_sol: msg.marketCapSol || null,
    tx_signature: msg.signature || null,
    raw_creation_event: msg,
  });

  tokenTrades.set(mint, []);

  if (config.JWT_TOKEN) {
    // JWT available — subscribe to live trades and fetch historical trades via REST
    if (subscribeTrades) {
      ws.send(
        JSON.stringify({
          method: "subscribeTokenTrade",
          keys: [mint],
        })
      );
    }

    // Schedule trade fetch via REST API after delay
    setTimeout(async () => {
      try {
        console.log(`  [fetch-trades] Fetching historical trades for ${mint.slice(0, 8)}...`);
        const restTrades = await fetchAllTrades(mint);
        const existing = tokenTrades.get(mint) || [];
        // Merge: REST trades first, then any WS trades not already present
        const restSigs = new Set(restTrades.map((t) => t.signature));
        const uniqueWsTrades = existing.filter((t) => !restSigs.has(t.signature));
        tokenTrades.set(mint, [...restTrades, ...uniqueWsTrades]);
      } catch (err) {
        console.error(`  [fetch-trades] Error for ${mint.slice(0, 8)}: ${err.message}`);
      }
    }, tradeDelaySec * 1000);
  } else {
    // No JWT — skip trade fetching, fetch candlestick data instead
    setTimeout(async () => {
      try {
        console.log(`  [candles] Fetching candlestick data for ${mint.slice(0, 8)}... (no JWT)`);
        const candles = await fetchCandlesticks(mint);
        // Store candlesticks on the pending token data
        const tokenData = pendingTokens.get(mint);
        if (tokenData) {
          tokenData.candlesticks = candles;
          tokenData.candlesticks_count = candles.length;
          console.log(`  [candles] Got ${candles.length} candlesticks for ${mint.slice(0, 8)}`);
        }
      } catch (err) {
        console.error(`  [candles] Error for ${mint.slice(0, 8)}: ${err.message}`);
      }
    }, tradeDelaySec * 1000);
  }
}

function handleTrade(msg, tokenTrades) {
  const mint = msg.mint;
  if (!mint) return;

  const trades = tokenTrades.get(mint);
  if (trades) {
    trades.push({
      signature: msg.signature || null,
      type: msg.txType,
      sol_amount: msg.solAmount || msg.sol_amount || null,
      token_amount: msg.tokenAmount || msg.token_amount || null,
      trader: msg.traderPublicKey || null,
      timestamp: msg.timestamp || Date.now(),
      new_market_cap_sol: msg.marketCapSol || null,
      bonding_curve_key: msg.bondingCurveKey || null,
      virtual_sol_reserves: msg.vSolInBondingCurve || null,
      virtual_token_reserves: msg.vTokensInBondingCurve || null,
      raw_event: msg,
    });
  }
}

function handleMigration(msg) {
  const mint = msg.mint;
  if (!mint) return;

  console.log(`[graduated] Token ${mint.slice(0, 8)}... has graduated/migrated!`);

  // Update saved file if it exists
  const existing = storage.loadToken(mint);
  if (existing) {
    existing.graduated = true;
    existing.graduation_event = msg;
    existing.graduation_timestamp = msg.timestamp || Date.now();
    storage.saveToken(existing);
  }
}

async function saveAccumulatedTokens(pendingTokens, tokenTrades) {
  let saved = 0;

  for (const [mint, tokenData] of pendingTokens) {
    const trades = tokenTrades.get(mint) || [];

    // Save if we have the token data (even with 0 trades)
    const fullData = {
      ...tokenData,
      graduated: false,
      graduation_event: null,
      trades_count: trades.length,
      trades,
      candlesticks_count: (tokenData.candlesticks || []).length,
      candlesticks: tokenData.candlesticks || [],
      last_updated: new Date().toISOString(),
      data_source: "pumpportal_live",
    };

    storage.saveToken(fullData);
    saved++;
  }

  if (saved > 0) {
    console.log(
      `[save] Saved/updated ${saved} tokens. Total on disk: ${storage.getTokenCount()}`
    );
  }
}

module.exports = { startLiveCollector };
