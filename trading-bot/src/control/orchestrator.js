/**
 * Orchestrator — coordinates the full pipeline from Node.js.
 * Calls Python for LightGBM training/prediction via child_process.
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { config } = require("../config");
const { fetchAll, loadRawData } = require("../data/fetcher");
const { aggregateCandles } = require("../data/aggregator");
const { exportTrainingData } = require("../features/engineer");

class Orchestrator {
  constructor() {
    this.state = {
      status: "idle",
      lastFetch: null,
      lastTrain: null,
      lastDecay: null,
      trainResult: null,
      decayResult: null,
      fetchProgress: null,
      error: null,
    };
    this.listeners = [];
  }

  onUpdate(fn) {
    this.listeners.push(fn);
  }

  _emit(update) {
    Object.assign(this.state, update);
    for (const fn of this.listeners) fn(this.state);
  }

  // ─── Fetch Pipeline ─────────────────────────────────────────────

  async runFetch() {
    this._emit({ status: "fetching", error: null, fetchProgress: { phase: "starting" } });
    try {
      const results = await fetchAll((progress) => {
        this._emit({ fetchProgress: progress });
      });
      this._emit({
        status: "idle",
        lastFetch: new Date().toISOString(),
        fetchProgress: { phase: "done", tokens: results.length },
      });
      return { success: true, tokens: results.length };
    } catch (err) {
      this._emit({ status: "error", error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ─── Feature Engineering ────────────────────────────────────────

  runFeatures(timeframeMinutes) {
    const rawData = loadRawData();
    if (rawData.length === 0) {
      return { success: false, error: "No raw data. Run fetch first." };
    }

    // Re-aggregate candles if needed
    const targetMinutes = timeframeMinutes || config.CANDLE_MINUTES;
    const processed = rawData.map((data) => {
      const sourceMinutes = parseInt(config.DEFAULT_AGGREGATE) *
        (config.DEFAULT_TIMEFRAME === "minute" ? 1 : config.DEFAULT_TIMEFRAME === "hour" ? 60 : 1440);

      return {
        ...data,
        candles: aggregateCandles(data.candles, targetMinutes, sourceMinutes),
      };
    });

    const stats = exportTrainingData(processed);
    return stats ? { success: true, ...stats } : { success: false, error: "No valid features produced" };
  }

  // ─── LightGBM Training (via Python) ─────────────────────────────

  async runTrain() {
    this._emit({ status: "training", error: null });

    const csvPath = path.join(config.FEATURES_DIR, "training_data.csv");
    if (!fs.existsSync(csvPath)) {
      this._emit({ status: "error", error: "No training data. Run features first." });
      return { success: false, error: "No training data CSV" };
    }

    try {
      const configJson = JSON.stringify(config);
      const result = await this._runPython("train", [csvPath, configJson, config.MODEL_DIR]);
      this._emit({
        status: "idle",
        lastTrain: new Date().toISOString(),
        trainResult: result,
      });
      return { success: true, ...result };
    } catch (err) {
      this._emit({ status: "error", error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ─── Pattern Decay Analysis ─────────────────────────────────────

  async runDecayAnalysis() {
    this._emit({ status: "analyzing_decay", error: null });

    const csvPath = path.join(config.FEATURES_DIR, "training_data.csv");
    if (!fs.existsSync(csvPath)) {
      this._emit({ status: "error", error: "No training data. Run features first." });
      return { success: false, error: "No training data CSV" };
    }

    try {
      const configJson = JSON.stringify(config);
      const result = await this._runPython("decay", [csvPath, configJson, config.MODEL_DIR]);
      this._emit({
        status: "idle",
        lastDecay: new Date().toISOString(),
        decayResult: result,
      });
      return { success: true, ...result };
    } catch (err) {
      this._emit({ status: "error", error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ─── Predict ────────────────────────────────────────────────────

  async runPredict(csvPath) {
    const modelPath = path.join(config.MODEL_DIR, "model.lgbm");
    if (!fs.existsSync(modelPath)) {
      return { success: false, error: "No trained model. Run train first." };
    }
    const dataPath = csvPath || path.join(config.FEATURES_DIR, "training_data.csv");
    try {
      const result = await this._runPython("predict", [dataPath, modelPath]);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Full Pipeline ──────────────────────────────────────────────

  async runFullPipeline(timeframeMinutes) {
    // 1. Fetch
    const fetchResult = await this.runFetch();
    if (!fetchResult.success) return fetchResult;

    // 2. Features
    const featResult = this.runFeatures(timeframeMinutes);
    if (!featResult.success) return featResult;

    // 3. Train
    const trainResult = await this.runTrain();
    if (!trainResult.success) return trainResult;

    // 4. Decay analysis
    const decayResult = await this.runDecayAnalysis();

    return {
      success: true,
      fetch: fetchResult,
      features: featResult,
      train: trainResult,
      decay: decayResult,
    };
  }

  // ─── Python Bridge ──────────────────────────────────────────────

  _runPython(command, args = []) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(config.PYTHON_DIR, "trainer.py");
      const proc = spawn("python3", [scriptPath, command, ...args], {
        cwd: config.PYTHON_DIR,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        // Forward LightGBM training progress
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            this._emit({ trainLog: line.trim() });
          }
        }
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          // Find the last JSON object in stdout
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            resolve({ raw: stdout });
          }
        } catch (err) {
          resolve({ raw: stdout });
        }
      });

      proc.on("error", (err) => reject(err));
    });
  }

  getState() {
    return { ...this.state };
  }
}

module.exports = { Orchestrator };
