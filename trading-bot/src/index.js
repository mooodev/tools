#!/usr/bin/env node

/**
 * EMH Trading Bot — Main Entry Point
 *
 * Based on Efficient Market Hypothesis (Fama, 1970):
 *   Patterns exist but decay as market participants discover them.
 *   Find fresh patterns. Trade them. Detect when they die.
 *
 * Usage:
 *   node src/index.js dashboard    — Start web dashboard (default)
 *   node src/index.js fetch        — Fetch 72h candle data
 *   node src/index.js features     — Engineer features from raw data
 *   node src/index.js train        — Train LightGBM model
 *   node src/index.js decay        — Run pattern decay analysis
 *   node src/index.js predict      — Run predictions
 *   node src/index.js pipeline     — Run full pipeline
 */

const { config } = require("./config");
const { Orchestrator } = require("./control/orchestrator");
const { startServer } = require("./control/server");

const command = process.argv[2] || "dashboard";
const orchestrator = new Orchestrator();

orchestrator.onUpdate((state) => {
  if (state.trainLog) process.stdout.write(`  ${state.trainLog}\n`);
});

async function main() {
  switch (command) {
    case "dashboard":
    case "web":
    case "serve":
      startServer();
      break;

    case "fetch":
      console.log(`\n  Fetching ${config.FETCH_HOURS}h of candle data (${config.DEFAULT_AGGREGATE}${config.DEFAULT_TIMEFRAME.charAt(0)} candles)...\n`);
      const fetchResult = await orchestrator.runFetch();
      console.log("\n  Fetch result:", JSON.stringify(fetchResult, null, 2));
      break;

    case "features":
      console.log("\n  Engineering features...\n");
      const timeframe = parseInt(process.argv[3]) || config.CANDLE_MINUTES;
      const featResult = orchestrator.runFeatures(timeframe);
      console.log("\n  Features result:", JSON.stringify(featResult, null, 2));
      break;

    case "train":
      console.log("\n  Training LightGBM...\n");
      const trainResult = await orchestrator.runTrain();
      console.log("\n  Train result:", JSON.stringify(trainResult, null, 2));
      break;

    case "decay":
      console.log("\n  Analyzing pattern decay (EMH analysis)...\n");
      const decayResult = await orchestrator.runDecayAnalysis();
      console.log("\n  Decay result:", JSON.stringify(decayResult, null, 2));
      break;

    case "predict":
      console.log("\n  Running predictions...\n");
      const predictResult = await orchestrator.runPredict();
      console.log("\n  Predictions:", JSON.stringify(predictResult, null, 2));
      break;

    case "pipeline":
      console.log("\n  Running full pipeline (fetch → features → train → decay)...\n");
      const pipelineResult = await orchestrator.runFullPipeline();
      console.log("\n  Pipeline result:", JSON.stringify(pipelineResult, null, 2));
      break;

    default:
      console.log(`  Unknown command: ${command}`);
      console.log(`  Available: dashboard, fetch, features, train, decay, predict, pipeline`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
