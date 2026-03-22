const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3456;
const PROJECT_DIR = path.resolve(__dirname, "..");
const METRICS_FILE = path.join(PROJECT_DIR, "metrics.jsonl");
const RESULTS_FILE = path.join(PROJECT_DIR, "results.tsv");

let trainProcess = null;
let isRunning = false;
let currentRunMode = null; // "baseline" | "experiment" | "auto"

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ── REST API ────────────────────────────────────────────────────────────────

app.get("/api/status", (req, res) => {
  res.json({
    running: isRunning,
    mode: currentRunMode,
    pid: trainProcess ? trainProcess.pid : null,
  });
});

app.get("/api/metrics", (req, res) => {
  const metrics = loadMetrics();
  res.json(metrics);
});

app.get("/api/results", (req, res) => {
  const results = loadResults();
  res.json(results);
});

app.get("/api/data-files", (req, res) => {
  const dataDir = path.join(PROJECT_DIR, "data");
  try {
    const files = fs
      .readdirSync(dataDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const content = JSON.parse(
          fs.readFileSync(path.join(dataDir, f), "utf8")
        );
        return {
          file: f,
          tokenName: content.meta?.tokenName || "Unknown",
          totalCandles: content.meta?.totalCandles || content.candles?.length || 0,
          timeframe: content.meta?.timeframe || "unknown",
        };
      });
    res.json(files);
  } catch {
    res.json([]);
  }
});

app.post("/api/start", (req, res) => {
  const { mode = "baseline", name = "manual" } = req.body;
  if (isRunning) {
    return res.status(409).json({ error: "Training already running" });
  }
  startTraining(mode, name);
  res.json({ started: true, mode });
});

app.post("/api/stop", (req, res) => {
  if (!isRunning || !trainProcess) {
    return res.status(409).json({ error: "No training running" });
  }
  trainProcess.kill("SIGTERM");
  res.json({ stopped: true });
});

// ── Training Process Management ─────────────────────────────────────────────

function startTraining(mode, name) {
  // Clear metrics file for new run
  fs.writeFileSync(METRICS_FILE, "");

  let args;
  if (mode === "baseline") {
    args = [path.join(PROJECT_DIR, "run.py"), "--baseline"];
  } else if (mode === "auto") {
    args = [path.join(PROJECT_DIR, "run.py"), "--auto", "1"];
  } else {
    args = [path.join(PROJECT_DIR, "run.py"), "--name", name];
  }

  isRunning = true;
  currentRunMode = mode;

  trainProcess = spawn("python3", args, {
    cwd: PROJECT_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  let outputBuffer = "";

  trainProcess.stdout.on("data", (data) => {
    const text = data.toString();
    outputBuffer += text;
    broadcast({ type: "stdout", data: text });

    // Parse live metrics from the metrics file
    tryBroadcastMetrics();
  });

  trainProcess.stderr.on("data", (data) => {
    broadcast({ type: "stderr", data: data.toString() });
  });

  trainProcess.on("close", (code) => {
    isRunning = false;
    currentRunMode = null;
    trainProcess = null;

    // Send final metrics
    tryBroadcastMetrics();

    // Send results update
    const results = loadResults();
    broadcast({ type: "results", data: results });

    broadcast({ type: "finished", code, output: outputBuffer });
  });

  broadcast({ type: "started", mode });
}

function tryBroadcastMetrics() {
  const metrics = loadMetrics();
  if (metrics.length > 0) {
    broadcast({ type: "metrics", data: metrics });
  }
}

// ── Data Loading ────────────────────────────────────────────────────────────

function loadMetrics() {
  try {
    const content = fs.readFileSync(METRICS_FILE, "utf8").trim();
    if (!content) return [];
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadResults() {
  try {
    const content = fs.readFileSync(RESULTS_FILE, "utf8").trim();
    if (!content) return [];
    const lines = content.split("\n");
    const header = lines[0].split("\t");
    return lines.slice(1).map((line) => {
      const parts = line.split("\t");
      const obj = {};
      header.forEach((h, i) => (obj[h] = parts[i] || ""));
      return obj;
    });
  } catch {
    return [];
  }
}

// ── WebSocket ───────────────────────────────────────────────────────────────

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  // Send current state on connect
  ws.send(
    JSON.stringify({
      type: "init",
      status: { running: isRunning, mode: currentRunMode },
      metrics: loadMetrics(),
      results: loadResults(),
    })
  );
});

// ── Watch metrics file for changes ──────────────────────────────────────────

let metricsWatcher = null;
function watchMetrics() {
  try {
    // Ensure file exists
    if (!fs.existsSync(METRICS_FILE)) {
      fs.writeFileSync(METRICS_FILE, "");
    }
    metricsWatcher = fs.watch(METRICS_FILE, () => {
      tryBroadcastMetrics();
    });
  } catch {
    // File watch not supported, rely on stdout polling
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}`);
  watchMetrics();
});
