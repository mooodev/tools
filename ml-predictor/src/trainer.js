/**
 * Training Loop with Walk-Forward Validation
 *
 * Features:
 *   - Early stopping with patience
 *   - Class weight balancing for imbalanced data
 *   - Walk-forward cross-validation (Simons approach: no future leakage)
 *   - Detailed metrics logging per epoch
 *   - Model checkpointing (saves best model)
 */

const fs = require("fs");
const config = require("./config");
const { initTF, buildModel, compileModel, toTensors, saveModel } = require("./model");
const { loadDataset, computeClassWeights } = require("./data-loader");

/**
 * Train the model on the loaded dataset.
 */
async function train() {
  const tf = initTF();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ML Token Growth Predictor — Training");
  console.log("  Architecture: LSTM + Self-Attention + Dense");
  console.log("═══════════════════════════════════════════════════════\n");

  // Load and prepare data
  const dataset = loadDataset();
  if (!dataset) {
    console.log("\nCannot train: no data available.");
    return;
  }

  const { train: trainSet, val: valSet, test: testSet, scaler, featureNames } = dataset;

  const nFeatures = featureNames.length;
  const timesteps = config.LOOKBACK_WINDOW;

  console.log(`\nModel input shape: [${timesteps}, ${nFeatures}]`);
  console.log(`Feature count: ${nFeatures}`);
  console.log(`Features: ${featureNames.join(", ")}\n`);

  // Build & compile model
  const model = buildModel(timesteps, nFeatures);
  const classWeights = computeClassWeights(trainSet.y);
  console.log(`Class weights: ${JSON.stringify(classWeights)}\n`);
  compileModel(model, classWeights);
  model.summary();

  // Convert to tensors
  console.log("\nConverting data to tensors...");
  const { xTensor: xTrain, yTensor: yTrain } = toTensors(trainSet.X, trainSet.y);
  const { xTensor: xVal, yTensor: yVal } = toTensors(valSet.X, valSet.y);

  // Training with early stopping
  console.log("\n─── Training ───────────────────────────────────────────\n");

  let bestValLoss = Infinity;
  let bestValAcc = 0;
  let patienceCounter = 0;
  let bestEpoch = 0;

  for (let epoch = 1; epoch <= config.EPOCHS; epoch++) {
    const history = await model.fit(xTrain, yTrain, {
      epochs: 1,
      batchSize: config.BATCH_SIZE,
      validationData: [xVal, yVal],
      classWeight: classWeights,
      shuffle: true,
      verbose: 0,
    });

    const trainLoss = history.history.loss[0];
    const trainAcc = history.history.acc[0];
    const valLoss = history.history.val_loss[0];
    const valAcc = history.history.val_acc[0];

    const improved = valLoss < bestValLoss;
    if (improved) {
      bestValLoss = valLoss;
      bestValAcc = valAcc;
      bestEpoch = epoch;
      patienceCounter = 0;

      // Save best model
      await saveModel(model, config.MODEL_DIR);
      saveScaler(scaler, featureNames);
    } else {
      patienceCounter++;
    }

    const marker = improved ? " ★" : "";
    console.log(
      `  Epoch ${String(epoch).padStart(3)}/${config.EPOCHS} | ` +
      `Loss: ${trainLoss.toFixed(4)} | Acc: ${(trainAcc * 100).toFixed(1)}% | ` +
      `Val Loss: ${valLoss.toFixed(4)} | Val Acc: ${(valAcc * 100).toFixed(1)}%${marker}`
    );

    if (patienceCounter >= config.PATIENCE) {
      console.log(`\n  Early stopping at epoch ${epoch} (patience=${config.PATIENCE}).`);
      console.log(`  Best epoch: ${bestEpoch} (val_loss=${bestValLoss.toFixed(4)}, val_acc=${(bestValAcc * 100).toFixed(1)}%)`);
      break;
    }
  }

  // ─── Evaluate on test set ──────────────────────────────────────

  console.log("\n─── Test Set Evaluation ────────────────────────────────\n");

  const { xTensor: xTest, yTensor: yTest } = toTensors(testSet.X, testSet.y);
  const evalResult = model.evaluate(xTest, yTest, { batchSize: config.BATCH_SIZE });
  const testLoss = (await evalResult[0].data())[0];
  const testAcc = (await evalResult[1].data())[0];

  console.log(`  Test Loss:     ${testLoss.toFixed(4)}`);
  console.log(`  Test Accuracy: ${(testAcc * 100).toFixed(1)}%`);

  // Confusion matrix
  const predictions = model.predict(xTest);
  const predClasses = (await predictions.argMax(-1).data());
  const trueClasses = testSet.y;

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

  // Cleanup tensors
  xTrain.dispose();
  yTrain.dispose();
  xVal.dispose();
  yVal.dispose();
  xTest.dispose();
  yTest.dispose();
  predictions.dispose();

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
  const tf = initTF();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Walk-Forward Cross-Validation");
  console.log(`  Folds: ${nFolds}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const dataset = loadDataset();
  if (!dataset) return;

  // Combine train+val+test for walk-forward splitting
  const allX = [...dataset.train.X, ...dataset.val.X, ...dataset.test.X];
  const allY = [...dataset.train.y, ...dataset.val.y, ...dataset.test.y];
  const { featureNames } = dataset;

  const nFeatures = featureNames.length;
  const timesteps = config.LOOKBACK_WINDOW;
  const foldSize = Math.floor(allX.length / (nFolds + 1));

  const foldResults = [];

  for (let fold = 0; fold < nFolds; fold++) {
    const trainEnd = foldSize * (fold + 1);
    const valEnd = Math.min(trainEnd + foldSize, allX.length);

    const foldTrainX = allX.slice(0, trainEnd);
    const foldTrainY = allY.slice(0, trainEnd);
    const foldValX = allX.slice(trainEnd, valEnd);
    const foldValY = allY.slice(trainEnd, valEnd);

    console.log(`\n─── Fold ${fold + 1}/${nFolds} ─────────────────────────────`);
    console.log(`  Train: ${foldTrainX.length} samples | Val: ${foldValX.length} samples`);

    const model = buildModel(timesteps, nFeatures);
    const classWeights = computeClassWeights(foldTrainY);
    compileModel(model, classWeights);

    const { xTensor: xTrain, yTensor: yTrain } = toTensors(foldTrainX, foldTrainY);
    const { xTensor: xVal, yTensor: yVal } = toTensors(foldValX, foldValY);

    let bestLoss = Infinity;
    let patience = 0;

    for (let epoch = 1; epoch <= config.EPOCHS; epoch++) {
      const history = await model.fit(xTrain, yTrain, {
        epochs: 1,
        batchSize: config.BATCH_SIZE,
        validationData: [xVal, yVal],
        classWeight: classWeights,
        shuffle: true,
        verbose: 0,
      });

      const valLoss = history.history.val_loss[0];
      if (valLoss < bestLoss) {
        bestLoss = valLoss;
        patience = 0;
      } else {
        patience++;
      }

      if (patience >= config.PATIENCE) break;
    }

    const evalResult = model.evaluate(xVal, yVal, { batchSize: config.BATCH_SIZE });
    const valLoss = (await evalResult[0].data())[0];
    const valAcc = (await evalResult[1].data())[0];

    foldResults.push({ fold: fold + 1, valLoss, valAcc });
    console.log(`  Result: Loss=${valLoss.toFixed(4)}, Acc=${(valAcc * 100).toFixed(1)}%`);

    // Cleanup
    xTrain.dispose();
    yTrain.dispose();
    xVal.dispose();
    yVal.dispose();
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
