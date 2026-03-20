const express = require('express');
const path = require('path');
const config = require('./config');
const monitor = require('./monitor');

function createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ── SSE stream ──
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: connected\ndata: {}\n\n');
    monitor.addSSEClient(res);
  });

  // ── Monitor endpoints ──
  app.get('/api/tokens', (_req, res) => {
    res.json(monitor.getMonitoredTokens());
  });

  app.get('/api/status', (_req, res) => {
    res.json(monitor.getStatus());
  });

  app.post('/api/scan', async (_req, res) => {
    res.json({ ok: true, message: 'Scan started' });
    monitor.runScan().then(() => monitor.runPriceUpdate());
  });

  app.post('/api/update-prices', async (_req, res) => {
    res.json({ ok: true, message: 'Price update started' });
    monitor.runPriceUpdate();
  });

  app.post('/api/auto-scan/start', (_req, res) => {
    monitor.startLoops();
    res.json({ ok: true, message: 'Auto-scan started' });
  });

  app.post('/api/auto-scan/stop', (_req, res) => {
    monitor.stopLoops();
    res.json({ ok: true, message: 'Auto-scan stopped' });
  });

  app.delete('/api/tokens/:mint', (req, res) => {
    const removed = monitor.removeToken(req.params.mint);
    res.json({ ok: removed });
  });

  app.post('/api/clear', (_req, res) => {
    monitor.clearAll();
    res.json({ ok: true });
  });

  // ── Config endpoints ──
  app.get('/api/config', (_req, res) => {
    res.json(config);
  });

  app.post('/api/config', (req, res) => {
    const updates = req.body;
    const updatedKeys = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key in config) {
        config[key] = value;
        updatedKeys.push(key);
      }
    }

    // Restart loops if timing-related config changed
    const timingKeys = ['PRICE_UPDATE_INTERVAL_MS', 'SCAN_INTERVAL_MS'];
    if (updatedKeys.some((k) => timingKeys.includes(k))) {
      monitor.restartLoops();
    }

    res.json({ ok: true, updated: updatedKeys, config });
  });

  return app;
}

module.exports = { createServer };
