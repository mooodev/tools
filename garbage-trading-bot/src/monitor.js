const config = require('./config');
const { scanTokens, getPoolInfo } = require('./scanner');

/**
 * Monitor list: Map<mint, MonitoredToken>
 *
 * MonitoredToken = {
 *   mint, name, symbol, poolAddress, imageUri, creator, createdAt,
 *   foundAt,         // ISO timestamp when first discovered
 *   foundPrice,      // price at discovery
 *   foundMcap,       // market cap at discovery
 *   currentPrice,    // latest price
 *   currentMcap,     // latest market cap
 *   currentVolume,   // latest 24h volume
 *   changePercent,   // % change from found price to current price
 *   mcapChangePercent, // % change from found mcap to current mcap
 *   lastUpdated,     // ISO timestamp of last price update
 * }
 */
const monitorList = new Map();

let scanTimer = null;
let updateTimer = null;
let isScanning = false;
let isUpdating = false;
let isAutoScanRunning = false;
let lastScanTime = null;
let lastUpdateTime = null;
let sseClients = [];
let scanAbortController = null;

function addSSEClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

function getMonitoredTokens() {
  return Array.from(monitorList.values()).sort(
    (a, b) => (b.changePercent || 0) - (a.changePercent || 0)
  );
}

function getStatus() {
  return {
    totalMonitored: monitorList.size,
    isScanning,
    isUpdating,
    isAutoScanRunning,
    lastScanTime,
    lastUpdateTime,
    scanIntervalMs: config.SCAN_INTERVAL_MS,
    updateIntervalMs: config.PRICE_UPDATE_INTERVAL_MS,
  };
}

/**
 * Run a scan for new tokens matching criteria and add them to monitor list.
 */
async function runScan() {
  if (isScanning) return;
  isScanning = true;
  scanAbortController = new AbortController();
  broadcast('status', { isScanning: true });

  console.log('[monitor] Starting token scan...');
  let newCount = 0;

  try {
    await scanTokens({
      signal: scanAbortController.signal,
      onLog: (msg, level) => {
        broadcast('scan_log', { msg, level });
      },
      onFound: (token) => {
        if (monitorList.has(token.mint)) return;
        if (monitorList.size >= config.MAX_MONITORED_TOKENS) return;

        const entry = {
          mint: token.mint,
          name: token.name,
          symbol: token.symbol,
          poolAddress: token.poolAddress,
          imageUri: token.imageUri,
          creator: token.creator,
          createdAt: token.createdAt,
          foundAt: new Date().toISOString(),
          foundPrice: token.priceUsd,
          foundMcap: token.marketCapUsd,
          currentPrice: token.priceUsd,
          currentMcap: token.marketCapUsd,
          currentVolume: token.volumeUsd24h,
          changePercent: 0,
          mcapChangePercent: 0,
          lastUpdated: new Date().toISOString(),
        };

        monitorList.set(token.mint, entry);
        newCount++;
        broadcast('token_found', entry);
        console.log(
          `  [+] ${token.symbol} (${token.name}) — mcap: $${token.marketCapUsd.toFixed(2)}, vol24h: $${token.volumeUsd24h.toFixed(0)}`
        );
      },
      onProgress: (p) => broadcast('scan_progress', p),
    });
  } catch (err) {
    console.error('[monitor] Scan error:', err.message);
  }

  isScanning = false;
  scanAbortController = null;
  lastScanTime = new Date().toISOString();
  broadcast('status', { isScanning: false, lastScanTime, newCount });
  console.log(`[monitor] Scan complete. ${newCount} new tokens found. Total monitored: ${monitorList.size}`);
}

/**
 * Stop a currently running scan.
 */
function stopScan() {
  if (scanAbortController) {
    scanAbortController.abort();
    return true;
  }
  return false;
}

/**
 * Update prices for all monitored tokens.
 */
async function runPriceUpdate() {
  if (isUpdating) return;
  if (monitorList.size === 0) return;

  isUpdating = true;
  broadcast('status', { isUpdating: true });

  console.log(`[monitor] Updating prices for ${monitorList.size} tokens...`);
  let updated = 0;
  let removed = 0;

  for (const [mint, entry] of monitorList) {
    try {
      const pool = await getPoolInfo(mint);
      if (!pool) continue;

      entry.currentPrice = pool.priceUsd;
      entry.currentMcap = pool.marketCapUsd || pool.fdvUsd;
      entry.currentVolume = pool.volumeUsd24h;
      entry.lastUpdated = new Date().toISOString();

      if (entry.foundPrice > 0) {
        entry.changePercent =
          ((entry.currentPrice - entry.foundPrice) / entry.foundPrice) * 100;
      }
      if (entry.foundMcap > 0) {
        entry.mcapChangePercent =
          ((entry.currentMcap - entry.foundMcap) / entry.foundMcap) * 100;
      }

      updated++;
    } catch (err) {
      console.warn(`  [update] Failed for ${entry.symbol}: ${err.message}`);
    }
  }

  isUpdating = false;
  lastUpdateTime = new Date().toISOString();
  broadcast('status', { isUpdating: false, lastUpdateTime });
  broadcast('tokens_updated', getMonitoredTokens());
  console.log(`[monitor] Price update done. ${updated} updated, ${removed} removed.`);
}

/**
 * Remove a token from the monitor list.
 */
function removeToken(mint) {
  const existed = monitorList.delete(mint);
  if (existed) broadcast('token_removed', { mint });
  return existed;
}

/**
 * Clear the entire monitor list.
 */
function clearAll() {
  monitorList.clear();
  broadcast('tokens_updated', []);
}

/**
 * Start the automated scan + price update loops.
 * Does NOT run an initial scan — all controls are manual via dashboard.
 */
function startLoops() {
  stopLoops();

  scanTimer = setInterval(() => runScan(), config.SCAN_INTERVAL_MS);
  updateTimer = setInterval(() => runPriceUpdate(), config.PRICE_UPDATE_INTERVAL_MS);
  isAutoScanRunning = true;

  broadcast('status', { isAutoScanRunning: true });
  console.log(
    `[monitor] Auto-scan started — scan every ${config.SCAN_INTERVAL_MS / 1000}s, update every ${config.PRICE_UPDATE_INTERVAL_MS / 1000}s`
  );
}

/**
 * Stop the automated loops.
 */
function stopLoops() {
  if (scanTimer) clearInterval(scanTimer);
  if (updateTimer) clearInterval(updateTimer);
  scanTimer = null;
  updateTimer = null;
  isAutoScanRunning = false;

  broadcast('status', { isAutoScanRunning: false });
  console.log('[monitor] Auto-scan stopped');
}

/**
 * Restart loops (after config change).
 */
function restartLoops() {
  if (!isAutoScanRunning) return; // only restart if was running
  stopLoops();
  startLoops();
}

module.exports = {
  getMonitoredTokens,
  getStatus,
  runScan,
  runPriceUpdate,
  stopScan,
  removeToken,
  clearAll,
  startLoops,
  stopLoops,
  restartLoops,
  addSSEClient,
};
