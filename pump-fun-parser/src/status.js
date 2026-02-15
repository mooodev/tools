const fs = require("fs");
const path = require("path");
const config = require("./config");

/**
 * Print a summary of all collected token data.
 */
function printStatus() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║       pump.fun Parser - Data Status      ║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (!fs.existsSync(config.TOKENS_DIR)) {
    console.log("No data directory found. Run the parser first.\n");
    return;
  }

  const files = fs.readdirSync(config.TOKENS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Total token files: ${files.length}\n`);

  if (files.length === 0) return;

  let graduated = 0;
  let notGraduated = 0;
  let totalTrades = 0;
  let maxTrades = { count: 0, name: "" };
  let withTrades = 0;
  let sources = {};

  for (const file of files) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(config.TOKENS_DIR, file), "utf8")
      );

      if (data.graduated) graduated++;
      else notGraduated++;

      const tc = data.trades_count || (data.trades ? data.trades.length : 0);
      totalTrades += tc;

      if (tc > 0) withTrades++;
      if (tc > maxTrades.count) {
        maxTrades = { count: tc, name: data.name || data.mint || file };
      }

      const src = data.data_source || "unknown";
      sources[src] = (sources[src] || 0) + 1;
    } catch {
      // Skip corrupt files
    }
  }

  console.log("--- Summary ---");
  console.log(`Graduated tokens:      ${graduated}`);
  console.log(`Not graduated tokens:  ${notGraduated}`);
  console.log(`Tokens with trades:    ${withTrades}`);
  console.log(`Total trades stored:   ${totalTrades}`);
  console.log(`Most traded token:     ${maxTrades.name} (${maxTrades.count} trades)`);
  console.log("");
  console.log("--- Data Sources ---");
  for (const [src, count] of Object.entries(sources)) {
    console.log(`  ${src}: ${count} tokens`);
  }
  console.log("");

  // Show 5 sample tokens
  console.log("--- Sample Tokens ---");
  const samples = files.slice(0, 5);
  for (const file of samples) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(config.TOKENS_DIR, file), "utf8")
      );
      const tc = data.trades_count || (data.trades ? data.trades.length : 0);
      console.log(
        `  ${(data.name || "?").padEnd(20)} | ${(data.symbol || "?").padEnd(8)} | ` +
        `graduated=${data.graduated ? "yes" : "no "} | trades=${tc} | ` +
        `${(data.mint || "").slice(0, 16)}...`
      );
    } catch {
      // skip
    }
  }
  console.log("");
}

printStatus();
