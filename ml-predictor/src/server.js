/**
 * Express server for the WebGPU training interface.
 *
 * Serves the browser-based training UI and provides API endpoints
 * for dataset loading and model save/load. The browser uses WebGPU
 * (Metal on M1/M2/M3 Mac) for GPU-accelerated training — no need
 * for Node.js --experimental-webgpu flag.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const config = require("./config");
const { loadDataset, listAvailableTokens, processToken, loadTokenMeta } = require("./data-loader");
const { applyScaler, createSequences } = require("./features");

function startServer() {
  const app = express();
  const port = config.WEB_PORT || 3000;

  // Body parsers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.raw({ type: "application/octet-stream", limit: "100mb" }));

  // Serve static web UI
  app.use(express.static(path.join(__dirname, "web")));

  // Serve saved model files (model.json, weights.bin) for tf.loadLayersModel
  app.use("/api/model/load", express.static(config.MODEL_DIR));

  // ─── API: Configuration ────────────────────────────────────────

  app.get("/api/config", (_req, res) => {
    res.json({
      LOOKBACK_WINDOW: config.LOOKBACK_WINDOW,
      PREDICTION_HORIZON: config.PREDICTION_HORIZON,
      MIN_CANDLES: config.MIN_CANDLES,
      GROWTH_THRESHOLD_UP: config.GROWTH_THRESHOLD_UP,
      GROWTH_THRESHOLD_DN: config.GROWTH_THRESHOLD_DN,
      LSTM_UNITS_1: config.LSTM_UNITS_1,
      LSTM_UNITS_2: config.LSTM_UNITS_2,
      DENSE_UNITS: config.DENSE_UNITS,
      DROPOUT_RATE: config.DROPOUT_RATE,
      LEARNING_RATE: config.LEARNING_RATE,
      BATCH_SIZE: config.BATCH_SIZE,
      EPOCHS: config.EPOCHS,
      PATIENCE: config.PATIENCE,
    });
  });

  // ─── API: Dataset ──────────────────────────────────────────────

  let cachedDataset = null;

  app.get("/api/dataset", (_req, res) => {
    try {
      if (!cachedDataset) {
        console.log("Processing dataset (this may take a moment)...");
        cachedDataset = loadDataset();
      }

      if (!cachedDataset) {
        return res.status(404).json({ error: "No data available. Run pump-fun-parser first." });
      }

      const ds = cachedDataset;
      res.json({
        nSamples: ds.nSamples,
        nFeatures: ds.nFeatures,
        lookback: ds.lookback,
        trainRange: ds.trainRange,
        valRange: ds.valRange,
        testRange: ds.testRange,
        scaler: ds.scaler,
        featureNames: ds.featureNames,
        labelCounts: ds.labelCounts,
        tokenStats: ds.tokenStats,
      });
    } catch (err) {
      console.error("Dataset error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/dataset/features", (_req, res) => {
    try {
      if (!cachedDataset) {
        cachedDataset = loadDataset();
      }
      if (!cachedDataset) {
        return res.status(404).json({ error: "No data available." });
      }

      res.set("Content-Type", "application/octet-stream");
      res.send(Buffer.from(cachedDataset.featureData.buffer));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/dataset/labels", (_req, res) => {
    try {
      if (!cachedDataset) {
        cachedDataset = loadDataset();
      }
      if (!cachedDataset) {
        return res.status(404).json({ error: "No data available." });
      }

      res.set("Content-Type", "application/octet-stream");
      res.send(Buffer.from(cachedDataset.labelData.buffer));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Tokens ───────────────────────────────────────────────

  app.get("/api/tokens", (_req, res) => {
    const tokens = listAvailableTokens();
    const result = tokens.map((t) => {
      const meta = loadTokenMeta(t.mint);
      return {
        mint: t.mint,
        name: meta?.name || meta?.symbol || t.mint.slice(0, 12),
      };
    });
    res.json(result);
  });

  app.get("/api/token/:mint/predict-data", (req, res) => {
    try {
      const { mint } = req.params;
      const result = processToken(mint);
      if (!result) {
        return res.status(404).json({ error: `Token ${mint} not found or insufficient data.` });
      }

      // Load scaler if available
      let scaler;
      try {
        scaler = JSON.parse(fs.readFileSync(config.SCALER_PATH, "utf8"));
      } catch {
        return res.status(400).json({ error: "No scaler found. Train a model first." });
      }

      const normalized = applyScaler(result.features, scaler);
      const { X } = createSequences(
        normalized,
        new Array(normalized.length).fill(0),
        config.LOOKBACK_WINDOW
      );

      if (X.length === 0) {
        return res.status(400).json({ error: "Not enough data for prediction." });
      }

      const meta = loadTokenMeta(mint);
      res.json({
        mint,
        tokenName: meta?.name || meta?.symbol || mint.slice(0, 12),
        lastWindow: X[X.length - 1],
        nWindows: X.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Model save/load ─────────────────────────────────────

  app.get("/api/model/exists", (_req, res) => {
    const exists = fs.existsSync(path.join(config.MODEL_DIR, "model.json"));
    res.json({ exists });
  });

  app.post("/api/model/save", (req, res) => {
    try {
      if (!fs.existsSync(config.MODEL_DIR)) {
        fs.mkdirSync(config.MODEL_DIR, { recursive: true });
      }

      // req.body is the model.json content (topology + weight manifest)
      fs.writeFileSync(
        path.join(config.MODEL_DIR, "model.json"),
        JSON.stringify(req.body, null, 2),
        "utf8"
      );
      console.log("Model topology saved.");
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/model/weights", (req, res) => {
    try {
      if (!fs.existsSync(config.MODEL_DIR)) {
        fs.mkdirSync(config.MODEL_DIR, { recursive: true });
      }

      fs.writeFileSync(path.join(config.MODEL_DIR, "weights.bin"), req.body);
      console.log("Model weights saved.");
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/model/scaler", (req, res) => {
    try {
      if (!fs.existsSync(config.MODEL_DIR)) {
        fs.mkdirSync(config.MODEL_DIR, { recursive: true });
      }

      fs.writeFileSync(config.SCALER_PATH, JSON.stringify(req.body, null, 2), "utf8");
      console.log("Scaler saved.");
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Start ─────────────────────────────────────────────────────

  app.listen(port, () => {
    console.log(`\n  WebGPU Training Interface running at:`);
    console.log(`  http://localhost:${port}\n`);
    console.log(`  Open this URL in Chrome or Safari on your M1/M2/M3 Mac`);
    console.log(`  to train with Metal GPU acceleration via WebGPU.\n`);
  });
}

module.exports = { startServer };
