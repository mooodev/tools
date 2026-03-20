const config = require('./config');
const { createServer } = require('./server');
const monitor = require('./monitor');

const app = createServer();

app.listen(config.PORT, () => {
  console.log(`\n  Garbage Trading Bot Dashboard`);
  console.log(`  http://localhost:${config.PORT}\n`);
  console.log(`  Settings:`);
  console.log(`    Min daily volume:  $${config.MIN_DAILY_VOLUME_USD.toLocaleString()}`);
  console.log(`    Max market cap:    $${config.MAX_MARKET_CAP_USD.toLocaleString()}`);
  console.log(`    Price update:      every ${config.PRICE_UPDATE_INTERVAL_MS / 1000}s`);
  console.log(`    Scan interval:     every ${config.SCAN_INTERVAL_MS / 1000}s`);
  console.log('');

  console.log('  Auto-scan is OFF. Use the dashboard to start scanning.\n');
});
