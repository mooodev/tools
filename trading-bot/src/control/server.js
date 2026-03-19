/**
 * Express API Server — control center for the trading bot.
 * Dashboard connects here for all operations.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const { config, updateConfig } = require("../config");
const { Orchestrator } = require("./orchestrator");

function startServer() {
  const app = express();
  const port = config.WEB_PORT || 3001;
  const orchestrator = new Orchestrator();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.static(path.join(__dirname, "..", "web")));

  // ─── SSE for real-time updates ──────────────────────────────────
  const sseClients = new Set();

  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });

  orchestrator.onUpdate((state) => {
    const data = JSON.stringify(state);
    for (const client of sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  });

  // ─── Config ─────────────────────────────────────────────────────

  app.get("/api/config", (_req, res) => {
    res.json(config);
  });

  app.post("/api/config", (req, res) => {
    const updated = updateConfig(req.body);
    res.json(updated);
  });

  // ─── State ──────────────────────────────────────────────────────

  app.get("/api/state", (_req, res) => {
    res.json(orchestrator.getState());
  });

  // ─── Pipeline Actions ───────────────────────────────────────────

  app.post("/api/fetch", async (_req, res) => {
    res.json({ started: true });
    orchestrator.runFetch();
  });

  app.post("/api/features", (req, res) => {
    const timeframe = req.body?.timeframe || config.CANDLE_MINUTES;
    const result = orchestrator.runFeatures(timeframe);
    res.json(result);
  });

  app.post("/api/train", async (_req, res) => {
    res.json({ started: true });
    orchestrator.runTrain();
  });

  app.post("/api/decay", async (_req, res) => {
    res.json({ started: true });
    orchestrator.runDecayAnalysis();
  });

  app.post("/api/predict", async (req, res) => {
    const result = await orchestrator.runPredict(req.body?.csvPath);
    res.json(result);
  });

  app.post("/api/pipeline", async (req, res) => {
    res.json({ started: true });
    orchestrator.runFullPipeline(req.body?.timeframe);
  });

  app.post("/api/screen", async (req, res) => {
    const result = await orchestrator.runScreen(
      req.body?.csvPath,
      req.body?.threshold,
      req.body?.topN
    );
    res.json(result);
  });

  app.post("/api/monitor", async (req, res) => {
    res.json({ started: true });
    orchestrator.runMonitor(req.body?.timeframe);
  });

  // ─── Data Endpoints ─────────────────────────────────────────────

  app.get("/api/raw-data", (_req, res) => {
    const rawDir = config.RAW_DIR;
    if (!fs.existsSync(rawDir)) return res.json([]);
    try {
      const manifest = path.join(rawDir, "_manifest.json");
      if (fs.existsSync(manifest)) {
        return res.json(JSON.parse(fs.readFileSync(manifest, "utf8")));
      }
      return res.json([]);
    } catch { return res.json([]); }
  });

  app.get("/api/features-stats", (_req, res) => {
    const statsPath = path.join(config.FEATURES_DIR, "stats.json");
    if (!fs.existsSync(statsPath)) return res.json(null);
    try {
      return res.json(JSON.parse(fs.readFileSync(statsPath, "utf8")));
    } catch { return res.json(null); }
  });

  app.get("/api/train-result", (_req, res) => {
    const resultPath = path.join(config.MODEL_DIR, "train_result.json");
    if (!fs.existsSync(resultPath)) return res.json(null);
    try {
      return res.json(JSON.parse(fs.readFileSync(resultPath, "utf8")));
    } catch { return res.json(null); }
  });

  app.get("/api/decay-result", (_req, res) => {
    const resultPath = path.join(config.MODEL_DIR, "decay_analysis.json");
    if (!fs.existsSync(resultPath)) return res.json(null);
    try {
      return res.json(JSON.parse(fs.readFileSync(resultPath, "utf8")));
    } catch { return res.json(null); }
  });

  app.get("/api/feature-names", (_req, res) => {
    const namesPath = path.join(config.FEATURES_DIR, "feature_names.json");
    if (!fs.existsSync(namesPath)) return res.json([]);
    try {
      return res.json(JSON.parse(fs.readFileSync(namesPath, "utf8")));
    } catch { return res.json([]); }
  });

  // ─── Start ──────────────────────────────────────────────────────

  app.listen(port, () => {
    console.log(`\n  Trading Bot Control Dashboard:`);
    console.log(`  http://localhost:${port}\n`);
  });

  return app;
}

module.exports = { startServer };
