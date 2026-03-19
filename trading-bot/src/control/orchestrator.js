/**
 * Orchestrator — coordinates the full pipeline from Node.js.
 * Calls Python for LightGBM training/prediction via child_process.
 */

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { config } = require("../config");
const { fetchAll, loadRawData } = require("../data/fetcher");
const { aggregateCandles } = require("../data/aggregator");
const { exportTrainingData } = require("../features/engineer");

class Orchestrator {
  constructor() {
    this.state = {
      status: "idle",
      lastFetch: null,
      lastFeatures: null,
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
    if (stats) {
      this._emit({ lastFeatures: new Date().toISOString() });
      return { success: true, ...stats };
    }
    return { success: false, error: "No valid features produced" };
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

      // If Python returned an error (e.g. not enough data), save it for dashboard
      if (result.error) {
        const trainPath = path.join(config.MODEL_DIR, "train_result.json");
        fs.mkdirSync(config.MODEL_DIR, { recursive: true });
        fs.writeFileSync(trainPath, JSON.stringify(result, null, 2));
      }

      this._emit({
        status: "idle",
        lastTrain: new Date().toISOString(),
        trainResult: result,
      });
      return { success: !result.error, ...result };
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

      // If Python returned an error (e.g. not enough windows), save it so dashboard can display
      if (result.error) {
        const decayPath = path.join(config.MODEL_DIR, "decay_analysis.json");
        fs.mkdirSync(config.MODEL_DIR, { recursive: true });
        fs.writeFileSync(decayPath, JSON.stringify(result, null, 2));
      }

      this._emit({
        status: "idle",
        lastDecay: new Date().toISOString(),
        decayResult: result,
      });
      return { success: !result.error, ...result };
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

  // ─── Screen Tokens (predict + rank) ────────────────────────

  async runScreen(csvPath, threshold, topN) {
    const modelPath = path.join(config.MODEL_DIR, "model.lgbm");
    if (!fs.existsSync(modelPath)) {
      return { success: false, error: "No trained model. Run train first." };
    }
    const dataPath = csvPath || path.join(config.FEATURES_DIR, "training_data.csv");
    if (!fs.existsSync(dataPath)) {
      return { success: false, error: "No feature data. Run features first." };
    }
    try {
      const args = [dataPath, modelPath];
      if (threshold) args.push(String(threshold));
      if (topN) args.push(String(topN));
      const result = await this._runPython("screen", args);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Live Monitor: fetch → features → screen ─────────────

  async runMonitor(timeframeMinutes) {
    this._emit({ status: "monitoring", error: null });
    try {
      // 1. Fetch fresh data
      const fetchResult = await this.runFetch();
      if (!fetchResult.success) return fetchResult;

      // 2. Engineer features
      const featResult = this.runFeatures(timeframeMinutes);
      if (!featResult.success) return featResult;

      // 3. Screen tokens with trained model
      const screenResult = await this.runScreen();
      this._emit({ status: "idle" });
      return {
        success: true,
        fetch: fetchResult,
        features: featResult,
        screen: screenResult,
      };
    } catch (err) {
      this._emit({ status: "error", error: err.message });
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

  _getVenvPython() {
    const projectRoot = path.join(config.PYTHON_DIR, "..", "..");
    const venvDir = path.join(projectRoot, "venv");
    const venvPython = path.join(venvDir, "bin", "python3");

    if (fs.existsSync(venvPython)) return venvPython;
    return null;
  }

  async _ensurePythonDeps() {
    const projectRoot = path.join(config.PYTHON_DIR, "..", "..");
    const venvDir = path.join(projectRoot, "venv");
    const venvPython = path.join(venvDir, "bin", "python3");

    if (!fs.existsSync(venvPython)) {
      this._emit({ trainLog: "Creating Python virtual environment..." });
      execSync("python3 -m venv venv", { cwd: projectRoot, stdio: "pipe" });
    }

    // macOS: LightGBM requires libomp (OpenMP) which isn't bundled
    if (os.platform() === "darwin") {
      try {
        execSync("brew list libomp", { stdio: "pipe" });
      } catch {
        this._emit({ trainLog: "Installing libomp (required by LightGBM on macOS)..." });
        try {
          execSync("brew install libomp", { stdio: "pipe", timeout: 120000 });
          this._emit({ trainLog: "libomp installed." });
        } catch (brewErr) {
          this._emit({ trainLog: "WARNING: Could not install libomp via Homebrew. Install manually: brew install libomp" });
        }
      }
    }

    // Check if numpy is importable (quick test for deps)
    try {
      execSync(`${venvPython} -c "import numpy, pandas, lightgbm, sklearn"`, {
        cwd: projectRoot,
        stdio: "pipe",
      });
    } catch {
      this._emit({ trainLog: "Installing Python dependencies (numpy, pandas, lightgbm, scikit-learn)..." });
      execSync(
        `${path.join(venvDir, "bin", "pip")} install lightgbm pandas numpy scikit-learn`,
        { cwd: projectRoot, stdio: "pipe", timeout: 120000 }
      );
      this._emit({ trainLog: "Python dependencies installed." });
    }
  }

  _runPython(command, args = []) {
    return new Promise(async (resolve, reject) => {
      try {
        await this._ensurePythonDeps();
      } catch (err) {
        reject(new Error(`Failed to set up Python environment: ${err.message}`));
        return;
      }

      const pythonBin = this._getVenvPython() || "python3";
      const scriptPath = path.join(config.PYTHON_DIR, "trainer.py");
      const proc = spawn(pythonBin, [scriptPath, command, ...args], {
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
