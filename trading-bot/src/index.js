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
 *   node src/index.js screen       — Screen tokens (rank by buy probability)
 *   node src/index.js monitor      — Live monitor (fetch → features → screen)
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

    case "screen":
      console.log("\n  Screening tokens (ranking by buy probability)...\n");
      const threshold = parseFloat(process.argv[3]) || 0.5;
      const topN = parseInt(process.argv[4]) || 20;
      const screenResult = await orchestrator.runScreen(null, threshold, topN);
      if (screenResult.success) {
        console.log(`\n  Screened ${screenResult.screened} tokens:`);
        console.log(`  BUY: ${screenResult.summary?.buy || 0}  HOLD: ${screenResult.summary?.hold || 0}  AVOID: ${screenResult.summary?.avoid || 0}\n`);
        if (screenResult.buy_signals?.length) {
          console.log("  Top BUY signals:");
          for (const t of screenResult.buy_signals.slice(0, 10)) {
            console.log(`    ${t.token_id}  prob=${(t.probability * 100).toFixed(1)}%  avg=${(t.avg_probability * 100).toFixed(1)}%  consistency=${t.consistency.toFixed(3)}`);
          }
        }
        if (screenResult.avoid_signals?.length) {
          console.log("\n  AVOID signals:");
          for (const t of screenResult.avoid_signals.slice(0, 5)) {
            console.log(`    ${t.token_id}  prob=${(t.probability * 100).toFixed(1)}%`);
          }
        }
      } else {
        console.log("  Screen failed:", screenResult.error);
      }
      break;

    case "monitor":
      console.log("\n  Live monitor: fetch → features → screen...\n");
      const monTimeframe = parseInt(process.argv[3]) || config.CANDLE_MINUTES;
      const monitorResult = await orchestrator.runMonitor(monTimeframe);
      if (monitorResult.success && monitorResult.screen) {
        const s = monitorResult.screen;
        console.log(`\n  Monitor complete. Screened ${s.screened} tokens:`);
        console.log(`  BUY: ${s.summary?.buy || 0}  HOLD: ${s.summary?.hold || 0}  AVOID: ${s.summary?.avoid || 0}\n`);
        if (s.buy_signals?.length) {
          console.log("  Top BUY signals:");
          for (const t of s.buy_signals.slice(0, 10)) {
            console.log(`    ${t.token_id}  prob=${(t.probability * 100).toFixed(1)}%  avg=${(t.avg_probability * 100).toFixed(1)}%`);
          }
        }
      } else {
        console.log("  Monitor result:", JSON.stringify(monitorResult, null, 2));
      }
      break;

    case "pipeline":
      console.log("\n  Running full pipeline (fetch → features → train → decay)...\n");
      const pipelineResult = await orchestrator.runFullPipeline();
      console.log("\n  Pipeline result:", JSON.stringify(pipelineResult, null, 2));
      break;

    default:
      console.log(`  Unknown command: ${command}`);
      console.log(`  Available: dashboard, fetch, features, train, decay, predict, screen, monitor, pipeline`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
