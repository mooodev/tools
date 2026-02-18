/**
 * Training Loop with Walk-Forward Validation
 *
 * Memory-efficient: never creates the full [N x lookback x features] tensor.
 * Instead, iterates through data in mini-batches, creating small tensors
 * on-the-fly from the flat Float32Array.
 *
 * Features:
 *   - Mini-batch gradient descent with on-the-fly sequence creation
 *   - Early stopping with patience
 *   - Class weight balancing via sample weighting
 *   - Walk-forward cross-validation (Simons approach: no future leakage)
 *   - Detailed metrics logging per epoch
 *   - Model checkpointing (saves best model)
 */

const fs = require("fs");
const config = require("./config");
const { initTF, buildModel, compileModel, saveModel } = require("./model");
const {
  loadDataset,
  createBatchTensors,
  computeClassWeights,
  shuffleIndices,
  sequentialIndices,
} = require("./data-loader");

/**
 * Run one epoch of training, iterating through shuffled mini-batches.
 * Returns { loss, acc } averaged over all batches.
 */
async function trainEpoch(model, dataset, classWeights, batchSize) {
  const tf = await initTF();
  const { featureData, labelData, nFeatures, lookback, trainRange } = dataset;
  const [trainStart, trainEnd] = trainRange;

  // Shuffle training indices each epoch
  const indices = shuffleIndices(trainStart, trainEnd);
  const nBatches = Math.ceil(indices.length / batchSize);

  let totalLoss = 0;
  let totalAcc = 0;
  let batchCount = 0;

  for (let b = 0; b < nBatches; b++) {
    const batchStart = b * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, indices.length);
    const batchIndices = indices.slice(batchStart, batchEnd);

    const { xTensor, yTensor } = createBatchTensors(
      featureData, labelData, batchIndices, nFeatures, lookback, tf
    );

    // Create sample weights from class weights
    const yArr = yTensor.dataSync();
    const weightArr = new Float32Array(yArr.length);
    for (let i = 0; i < yArr.length; i++) {
      weightArr[i] = classWeights[yArr[i]] || 1;
    }
    const sampleWeights = tf.tensor1d(weightArr);

    const result = await model.trainOnBatch(xTensor, yTensor, sampleWeights);

    // TF.js 4.x returns number|number[] from trainOnBatch (not Scalar tensors)
    let loss, acc;
    if (Array.isArray(result)) {
      loss = typeof result[0] === "number" ? result[0] : (await result[0].data())[0];
      acc = result.length > 1
        ? (typeof result[1] === "number" ? result[1] : (await result[1].data())[0])
        : 0;
    } else {
      loss = typeof result === "number" ? result : (await result.data())[0];
      acc = 0;
    }

    totalLoss += loss;
    totalAcc += acc;
    batchCount++;

    // Dispose tensors
    xTensor.dispose();
    yTensor.dispose();
    sampleWeights.dispose();
    if (Array.isArray(result)) {
      for (const r of result) {
        if (typeof r !== "number" && r && r.dispose) r.dispose();
      }
    } else if (typeof result !== "number" && result && result.dispose) {
      result.dispose();
    }
  }

  return {
    loss: totalLoss / batchCount,
    acc: totalAcc / batchCount,
  };
}

/**
 * Evaluate model on a range of data, iterating in mini-batches.
 * Returns { loss, acc, predictions, trueLabels }.
 */
async function evaluateRange(model, dataset, rangeKey, batchSize, collectPredictions = false) {
  const tf = await initTF();
  const { featureData, labelData, nFeatures, lookback } = dataset;
  const [rangeStart, rangeEnd] = dataset[rangeKey];

  const indices = sequentialIndices(rangeStart, rangeEnd);
  const nBatches = Math.ceil(indices.length / batchSize);

  let totalLoss = 0;
  let totalCorrect = 0;
  let totalSamples = 0;
  const allPredClasses = collectPredictions ? [] : null;
  const allTrueLabels = collectPredictions ? [] : null;

  for (let b = 0; b < nBatches; b++) {
    const batchStart = b * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, indices.length);
    const batchIndices = indices.slice(batchStart, batchEnd);
    const curBatchSize = batchIndices.length;

    const { xTensor, yTensor } = createBatchTensors(
      featureData, labelData, batchIndices, nFeatures, lookback, tf
    );

    // Get loss
    const evalResult = model.evaluate(xTensor, yTensor, { batchSize: curBatchSize });
    const batchLoss = (await evalResult[0].data())[0];
    totalLoss += batchLoss * curBatchSize;

    // Get predictions for accuracy
    const predictions = model.predict(xTensor);
    const predClasses = predictions.argMax(-1);
    const predData = await predClasses.data();
    const trueData = await yTensor.data();

    for (let i = 0; i < curBatchSize; i++) {
      if (predData[i] === trueData[i]) totalCorrect++;
      if (collectPredictions) {
        allPredClasses.push(predData[i]);
        allTrueLabels.push(trueData[i]);
      }
    }
    totalSamples += curBatchSize;

    // Cleanup
    xTensor.dispose();
    yTensor.dispose();
    evalResult[0].dispose();
    evalResult[1].dispose();
    predictions.dispose();
    predClasses.dispose();
  }

  return {
    loss: totalLoss / totalSamples,
    acc: totalCorrect / totalSamples,
    predictions: allPredClasses,
    trueLabels: allTrueLabels,
  };
}

/**
 * Train the model on the loaded dataset.
 */
async function train() {
  const tf = await initTF();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ML Token Growth Predictor — Training");
  console.log("  Architecture: LSTM + Self-Attention + Dense");
  console.log("  Memory: batched on-the-fly sequence creation");
  console.log("═══════════════════════════════════════════════════════\n");

  // Load and prepare data
  const dataset = loadDataset();
  if (!dataset) {
    console.log("\nCannot train: no data available.");
    return;
  }

  const { featureNames, nFeatures, lookback, trainRange, labelData } = dataset;

  console.log(`\nModel input shape: [${lookback}, ${nFeatures}]`);
  console.log(`Feature count: ${nFeatures}`);
  console.log(`Features: ${featureNames.join(", ")}\n`);

  // Build & compile model
  const model = await buildModel(lookback, nFeatures);
  const classWeights = computeClassWeights(labelData, trainRange[0], trainRange[1]);
  console.log(`Class weights: ${JSON.stringify(classWeights)}\n`);
  await compileModel(model);
  model.summary();

  const batchSize = config.BATCH_SIZE;
  const trainSamples = trainRange[1] - trainRange[0];
  const batchesPerEpoch = Math.ceil(trainSamples / batchSize);
  console.log(`\nBatches per epoch: ${batchesPerEpoch} (batch_size=${batchSize})`);

  // Training with early stopping
  console.log("\n─── Training ───────────────────────────────────────────\n");

  let bestValLoss = Infinity;
  let bestValAcc = 0;
  let patienceCounter = 0;
  let bestEpoch = 0;

  for (let epoch = 1; epoch <= config.EPOCHS; epoch++) {
    const epochStart = Date.now();

    // Train one epoch
    const trainResult = await trainEpoch(model, dataset, classWeights, batchSize);

    // Validate
    const valResult = await evaluateRange(model, dataset, "valRange", batchSize);

    const elapsed = ((Date.now() - epochStart) / 1000).toFixed(1);

    const improved = valResult.loss < bestValLoss;
    if (improved) {
      bestValLoss = valResult.loss;
      bestValAcc = valResult.acc;
      bestEpoch = epoch;
      patienceCounter = 0;

      // Save best model
      await saveModel(model, config.MODEL_DIR);
      saveScaler(dataset.scaler, featureNames);
    } else {
      patienceCounter++;
    }

    const marker = improved ? " ★" : "";
    console.log(
      `  Epoch ${String(epoch).padStart(3)}/${config.EPOCHS} (${elapsed}s) | ` +
      `Loss: ${trainResult.loss.toFixed(4)} | Acc: ${(trainResult.acc * 100).toFixed(1)}% | ` +
      `Val Loss: ${valResult.loss.toFixed(4)} | Val Acc: ${(valResult.acc * 100).toFixed(1)}%${marker}`
    );

    if (patienceCounter >= config.PATIENCE) {
      console.log(`\n  Early stopping at epoch ${epoch} (patience=${config.PATIENCE}).`);
      console.log(`  Best epoch: ${bestEpoch} (val_loss=${bestValLoss.toFixed(4)}, val_acc=${(bestValAcc * 100).toFixed(1)}%)`);
      break;
    }
  }

  // ─── Evaluate on test set ──────────────────────────────────────

  console.log("\n─── Test Set Evaluation ────────────────────────────────\n");

  const testResult = await evaluateRange(model, dataset, "testRange", batchSize, true);

  console.log(`  Test Loss:     ${testResult.loss.toFixed(4)}`);
  console.log(`  Test Accuracy: ${(testResult.acc * 100).toFixed(1)}%`);

  // Confusion matrix
  const predClasses = testResult.predictions;
  const trueClasses = testResult.trueLabels;

  const confMatrix = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < trueClasses.length; i++) {
    confMatrix[trueClasses[i]][predClasses[i]]++;
  }

  console.log("\n  Confusion Matrix (rows=actual, cols=predicted):");
  console.log("              Bearish  Neutral  Bullish");
  const classNames = ["Bearish", "Neutral", "Bullish"];
  for (let i = 0; i < 3; i++) {
    const row = confMatrix[i].map((v) => String(v).padStart(8)).join("");
    console.log(`  ${classNames[i].padEnd(10)}${row}`);
  }

  // Per-class precision/recall
  console.log("\n  Per-class metrics:");
  for (let i = 0; i < 3; i++) {
    const tp = confMatrix[i][i];
    const fp = confMatrix[0][i] + confMatrix[1][i] + confMatrix[2][i] - tp;
    const fn = confMatrix[i][0] + confMatrix[i][1] + confMatrix[i][2] - tp;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    console.log(
      `  ${classNames[i].padEnd(10)} Precision: ${(precision * 100).toFixed(1)}% | ` +
      `Recall: ${(recall * 100).toFixed(1)}% | F1: ${(f1 * 100).toFixed(1)}%`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Training complete.");
  console.log(`  Best model saved to: ${config.MODEL_DIR}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

/**
 * Walk-forward cross-validation.
 * Trains on expanding windows and validates on the next segment.
 * More robust evaluation than a single train/test split.
 */
async function walkForwardValidation(nFolds = 5) {
  const tf = await initTF();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Walk-Forward Cross-Validation");
  console.log(`  Folds: ${nFolds}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const dataset = loadDataset();
  if (!dataset) return;

  const { featureData, labelData, nFeatures, lookback, trainRange, valRange, testRange } = dataset;

  // Total valid range across all splits
  const totalStart = trainRange[0];
  const totalEnd = testRange[1];
  const totalCount = totalEnd - totalStart;
  const foldSize = Math.floor(totalCount / (nFolds + 1));

  const foldResults = [];
  const batchSize = config.BATCH_SIZE;

  for (let fold = 0; fold < nFolds; fold++) {
    const foldTrainEnd = totalStart + foldSize * (fold + 1);
    const foldValEnd = Math.min(foldTrainEnd + foldSize, totalEnd);

    const foldTrainCount = foldTrainEnd - totalStart;
    const foldValCount = foldValEnd - foldTrainEnd;

    console.log(`\n─── Fold ${fold + 1}/${nFolds} ─────────────────────────────`);
    console.log(`  Train: ${foldTrainCount} samples | Val: ${foldValCount} samples`);

    // Create a temporary dataset view for this fold
    const foldDataset = {
      featureData,
      labelData,
      nFeatures,
      lookback,
      trainRange: [totalStart, foldTrainEnd],
      valRange: [foldTrainEnd, foldValEnd],
    };

    const model = await buildModel(lookback, nFeatures);
    const classWeights = computeClassWeights(labelData, totalStart, foldTrainEnd);
    await compileModel(model);

    let bestLoss = Infinity;
    let patience = 0;

    for (let epoch = 1; epoch <= config.EPOCHS; epoch++) {
      await trainEpoch(model, foldDataset, classWeights, batchSize);
      const valResult = await evaluateRange(model, foldDataset, "valRange", batchSize);

      if (valResult.loss < bestLoss) {
        bestLoss = valResult.loss;
        patience = 0;
      } else {
        patience++;
      }

      if (patience >= config.PATIENCE) break;
    }

    const finalResult = await evaluateRange(model, foldDataset, "valRange", batchSize);

    foldResults.push({ fold: fold + 1, valLoss: finalResult.loss, valAcc: finalResult.acc });
    console.log(`  Result: Loss=${finalResult.loss.toFixed(4)}, Acc=${(finalResult.acc * 100).toFixed(1)}%`);

    model.dispose();
  }

  // Summary
  console.log("\n─── Walk-Forward Summary ───────────────────────────────\n");
  const avgLoss = foldResults.reduce((s, f) => s + f.valLoss, 0) / nFolds;
  const avgAcc = foldResults.reduce((s, f) => s + f.valAcc, 0) / nFolds;
  const stdAcc = Math.sqrt(
    foldResults.reduce((s, f) => s + Math.pow(f.valAcc - avgAcc, 2), 0) / nFolds
  );

  for (const f of foldResults) {
    console.log(`  Fold ${f.fold}: Loss=${f.valLoss.toFixed(4)}, Acc=${(f.valAcc * 100).toFixed(1)}%`);
  }
  console.log(`\n  Average: Loss=${avgLoss.toFixed(4)}, Acc=${(avgAcc * 100).toFixed(1)}% (±${(stdAcc * 100).toFixed(1)}%)`);
}

/**
 * Save scaler parameters for inference.
 */
function saveScaler(scaler, featureNames) {
  const dir = config.MODEL_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const scalerData = { ...scaler, featureNames };
  fs.writeFileSync(config.SCALER_PATH, JSON.stringify(scalerData, null, 2), "utf8");
}

module.exports = { train, walkForwardValidation };
