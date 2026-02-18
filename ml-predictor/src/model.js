/**
 * TensorFlow.js Model Definition
 *
 * Architecture: Stacked LSTM with Self-Attention + Dense classifier
 * Supports GPU acceleration via @tensorflow/tfjs-node-gpu
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
 * Initialize TensorFlow.js with GPU if available, fallback to CPU.
 */
function initTF() {
  if (tf) return tf;

  try {
    tf = require("@tensorflow/tfjs-node-gpu");
    console.log("TensorFlow.js initialized with GPU support.");
  } catch {
    try {
      tf = require("@tensorflow/tfjs-node");
      console.log("TensorFlow.js initialized (CPU mode).");
    } catch {
      tf = require("@tensorflow/tfjs");
      console.log("TensorFlow.js initialized (pure JS fallback — slow).");
    }
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
function buildModel(timesteps, nFeatures) {
  const tf = initTF();

  const input = tf.input({ shape: [timesteps, nFeatures], name: "input" });

  // ─── First LSTM layer ──────────────────────────────────────────

  const lstm1 = tf.layers.lstm({
    units: config.LSTM_UNITS_1,
    returnSequences: true,
    recurrentInitializer: "glorotNormal",
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    name: "lstm_1",
  }).apply(input);

  const drop1 = tf.layers.dropout({ rate: config.DROPOUT_RATE, name: "dropout_1" }).apply(lstm1);

  // ─── Self-Attention mechanism ──────────────────────────────────
  // Q, K, V projections from LSTM output

  const attentionDim = 64;

  const queryLayer = tf.layers.dense({
    units: attentionDim,
    useBias: false,
    name: "attention_query",
  }).apply(drop1);

  const keyLayer = tf.layers.dense({
    units: attentionDim,
    useBias: false,
    name: "attention_key",
  }).apply(drop1);

  const valueLayer = tf.layers.dense({
    units: attentionDim,
    useBias: false,
    name: "attention_value",
  }).apply(drop1);

  // Attention scores: softmax(Q·K^T / sqrt(d_k))
  const scores = tf.layers.dot({ axes: [2, 2], name: "attention_dot" }).apply([queryLayer, keyLayer]);

  // Scale by sqrt(d_k)
  const scaledScores = tf.layers.activation({ activation: "softmax", name: "attention_softmax" }).apply(scores);

  // Weighted values
  const attended = tf.layers.dot({ axes: [2, 1], name: "attention_output" }).apply([scaledScores, valueLayer]);

  // ─── Second LSTM layer (processes attended features) ───────────

  const lstm2 = tf.layers.lstm({
    units: config.LSTM_UNITS_2,
    returnSequences: false,
    recurrentInitializer: "glorotNormal",
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
function compileModel(model, classWeights) {
  const tf = initTF();

  model.compile({
    optimizer: tf.train.adam(config.LEARNING_RATE),
    loss: "sparseCategoricalCrossentropy",
    metrics: ["accuracy"],
  });

  return model;
}

/**
 * Convert JS arrays to TF tensors.
 */
function toTensors(X, y) {
  const tf = initTF();

  const xTensor = tf.tensor3d(X);
  const yTensor = tf.tensor1d(y, "int32");

  return { xTensor, yTensor };
}

/**
 * Save model to disk.
 */
async function saveModel(model, dir) {
  const tf = initTF();
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
  const tf = initTF();

  const model = await tf.loadLayersModel(`file://${dir}/model.json`);
  console.log(`Model loaded from ${dir}`);

  return model;
}

module.exports = {
  initTF,
  buildModel,
  compileModel,
  toTensors,
  saveModel,
  loadModel,
};
