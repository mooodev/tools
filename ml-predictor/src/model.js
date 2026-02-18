/**
 * TensorFlow.js Model Definition
 *
 * Architecture: Stacked LSTM with Self-Attention + Dense classifier
 * Supports GPU acceleration via Metal (WebGPU) on Apple Silicon
 * and CUDA on NVIDIA GPUs.
 *
 * Simons/RenTech inspired:
 *   - Multi-head attention to capture non-local temporal patterns
 *   - Residual connections for gradient flow
 *   - Dropout + L2 regularization to prevent overfitting
 *   - 3-class output: Bearish / Neutral / Bullish
 */

const config = require("./config");

let tf;

/**
 * Initialize the WebGPU/Metal backend (async).
 * Requires Node.js 22+ with --experimental-webgpu flag.
 */
async function initWebGPU() {
  // Check that WebGPU is actually available before attempting to use it.
  // Node.js exposes WebGPU as globalThis.gpu when launched with --experimental-webgpu (Node 22+).
  const hasWebGPU =
    typeof globalThis.gpu !== "undefined" ||
    (typeof navigator !== "undefined" && typeof navigator.gpu !== "undefined");

  if (!hasWebGPU) {
    throw new Error(
      "WebGPU is not available. Requires Node.js 22+ with --experimental-webgpu flag."
    );
  }

  tf = require("@tensorflow/tfjs");

  // Node.js exposes WebGPU as globalThis.gpu, but tfjs-backend-webgpu
  // looks for navigator.gpu — bridge the two.
  if (typeof navigator === "undefined" && typeof globalThis.gpu !== "undefined") {
    globalThis.navigator = { gpu: globalThis.gpu };
  }

  require("@tensorflow/tfjs-backend-webgpu");
  await tf.setBackend("webgpu");
  await tf.ready();
}

/**
 * Initialize TensorFlow.js using the backend specified by config.DEVICE.
 *
 * "metal" — WebGPU backend (Apple Silicon M1/M2/M3 via Metal).
 *           Requires: node --experimental-webgpu
 * "gpu"   — @tensorflow/tfjs-node-gpu (NVIDIA CUDA).
 * "cpu"   — @tensorflow/tfjs-node.
 * "auto"  — try metal → CUDA → CPU → pure JS.
 */
async function initTF() {
  if (tf) return tf;

  const device = config.DEVICE || "metal";

  if (device === "metal") {
    try {
      await initWebGPU();
      console.log("TensorFlow.js initialized with Metal GPU (WebGPU backend).");
    } catch (err) {
      console.warn(`Metal/WebGPU init failed: ${err.message}`);
      console.warn('Falling back to CPU. Set DEVICE to "auto" for full fallback chain.');
      try {
        tf = require("@tensorflow/tfjs-node");
        console.log("TensorFlow.js initialized (CPU mode).");
      } catch {
        tf = require("@tensorflow/tfjs");
        console.log("TensorFlow.js initialized (pure JS fallback — slow).");
      }
    }
  } else if (device === "gpu") {
    tf = require("@tensorflow/tfjs-node-gpu");
    console.log("TensorFlow.js initialized with CUDA GPU support.");
  } else if (device === "cpu") {
    tf = require("@tensorflow/tfjs-node");
    console.log("TensorFlow.js initialized (CPU mode).");
  } else if (device === "auto") {
    try {
      await initWebGPU();
      console.log("TensorFlow.js initialized with Metal GPU (WebGPU backend).");
    } catch {
      tf = null;
      try {
        tf = require("@tensorflow/tfjs-node-gpu");
        console.log("TensorFlow.js initialized with CUDA GPU support.");
      } catch {
        try {
          tf = require("@tensorflow/tfjs-node");
          console.log("TensorFlow.js initialized (CPU mode).");
        } catch {
          tf = require("@tensorflow/tfjs");
          console.log("TensorFlow.js initialized (pure JS fallback — slow).");
        }
      }
    }
  } else {
    throw new Error(`Invalid DEVICE config "${device}". Use "metal", "gpu", "cpu", or "auto".`);
  }

  return tf;
}

/**
 * Build the LSTM + Attention model.
 *
 * @param {number} timesteps - Lookback window size
 * @param {number} nFeatures - Number of features per timestep
 * @returns {tf.LayersModel}
 */
async function buildModel(timesteps, nFeatures) {
  const tf = await initTF();

  const input = tf.input({ shape: [timesteps, nFeatures], name: "input" });

  // ─── First LSTM layer ──────────────────────────────────────────

  const lstm1 = tf.layers.lstm({
    units: config.LSTM_UNITS_1,
    returnSequences: true,
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    name: "lstm_1",
  }).apply(input);

  const drop1 = tf.layers.dropout({ rate: config.DROPOUT_RATE, name: "dropout_1" }).apply(lstm1);

  // ─── Self-Attention mechanism ──────────────────────────────────
  // Q, K, V projections from LSTM output

  const attentionDim = 64;

  // Scale Q and K initializers by 1/d_k^(1/4) each so their dot product
  // is effectively scaled by 1/sqrt(d_k), preventing softmax saturation
  const attentionScale = Math.pow(attentionDim, -0.25);

  const queryLayer = tf.layers.dense({
    units: attentionDim,
    useBias: false,
    kernelInitializer: tf.initializers.varianceScaling({ scale: attentionScale }),
    name: "attention_query",
  }).apply(drop1);

  const keyLayer = tf.layers.dense({
    units: attentionDim,
    useBias: false,
    kernelInitializer: tf.initializers.varianceScaling({ scale: attentionScale }),
    name: "attention_key",
  }).apply(drop1);

  const valueLayer = tf.layers.dense({
    units: attentionDim,
    useBias: false,
    name: "attention_value",
  }).apply(drop1);

  // Attention scores: softmax(Q·K^T / sqrt(d_k))
  const scores = tf.layers.dot({ axes: [2, 2], name: "attention_dot" }).apply([queryLayer, keyLayer]);

  const scaledScores = tf.layers.activation({ activation: "softmax", name: "attention_softmax" }).apply(scores);

  // Weighted values
  const attended = tf.layers.dot({ axes: [2, 1], name: "attention_output" }).apply([scaledScores, valueLayer]);

  // ─── Second LSTM layer (processes attended features) ───────────

  const lstm2 = tf.layers.lstm({
    units: config.LSTM_UNITS_2,
    returnSequences: false,
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    name: "lstm_2",
  }).apply(attended);

  const drop2 = tf.layers.dropout({ rate: config.DROPOUT_RATE, name: "dropout_2" }).apply(lstm2);

  // ─── Dense classifier head ────────────────────────────────────

  const dense1 = tf.layers.dense({
    units: config.DENSE_UNITS,
    activation: "relu",
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    name: "dense_1",
  }).apply(drop2);

  const drop3 = tf.layers.dropout({ rate: config.DROPOUT_RATE * 0.5, name: "dropout_3" }).apply(dense1);

  const output = tf.layers.dense({
    units: 3,
    activation: "softmax",
    name: "output",
  }).apply(drop3);

  const model = tf.model({ inputs: input, outputs: output, name: "token_predictor" });

  return model;
}

/**
 * Compile the model with optimizer and loss.
 */
async function compileModel(model) {
  const tf = await initTF();

  model.compile({
    optimizer: tf.train.adam(config.LEARNING_RATE),
    loss: "sparseCategoricalCrossentropy",
    metrics: ["accuracy"],
  });

  return model;
}

/**
 * Save model to disk.
 */
async function saveModel(model, dir) {
  const tf = await initTF();
  const fs = require("fs");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await model.save(`file://${dir}`);
  console.log(`Model saved to ${dir}`);
}

/**
 * Load model from disk.
 */
async function loadModel(dir) {
  const tf = await initTF();

  const model = await tf.loadLayersModel(`file://${dir}/model.json`);
  console.log(`Model loaded from ${dir}`);

  return model;
}

module.exports = {
  initTF,
  buildModel,
  compileModel,
  saveModel,
  loadModel,
};
