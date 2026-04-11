// PHASE 5 — STARTUP SCRIPT
/**
 * Unified startup script (repo root). Square init + startup summary.
 * For HTTP API use: npm start or node src/start.js (Cheeky OS Express).
 *
 * Run as: node start.js
 *
 * Graceful shutdown on SIGINT/SIGTERM (Ctrl+C).
 *
 * @module start
 */

require("dotenv").config({
  path: require("path").join(__dirname, "email-intake", ".env"),
});

console.log("🔥 USING THIS FILE: square-client.js");
const fs = require("fs");
const path = require("path");
const { initializeSquareIntegration, getSquareIntegrationStatus } = require("./email-intake/cheeky-os/integrations/square");
const { printStartupEnvHints, getEngineReadinessFlags } = require("./email-intake/cheeky-os/safety/startup-env");

/** Ensure logs directory exists. */
fs.mkdirSync(path.join(__dirname, "email-intake", "logs"), { recursive: true });

/**
 * Build a formatted timestamp string.
 * @returns {string} Timestamp in YYYY-MM-DD HH:mm:ss format.
 */
function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Main startup function. Listens for shutdown signals.
 * @returns {Promise<void>}
 */
async function main() {
  // ── Initialize Square integration (non-blocking) ─────────────────────────
  try {
    await initializeSquareIntegration();
  } catch {
    // Square init is intentionally non-blocking
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🚀 CHEEKY OS — Starting Up");
  console.log(`  ${timestamp()}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  printStartupEnvHints();
  const engines = getEngineReadinessFlags();
  console.log(`  Cash engine:       ${engines.cashEngine.includes("ready") ? "✅" : "⚠️"} ${engines.cashEngine}`);
  console.log("  HTTP API:          use `npm start` or `node src/start.js` (Cheeky OS Express)");

  // ── Startup Summary ─────────────────────────────────────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  📊 CHEEKY OS — Startup Summary");
  console.log(`  Manual Intake:   node email-intake/intake.js (always available)`);
  console.log(`  Column Check:    node email-intake/dataverse/column-check.js`);
  let square = { status: "unknown" };
  try {
    square = getSquareIntegrationStatus() || square;
  } catch (err) {
    console.warn(`  ⚠️  Square status unavailable: ${err.message}`);
  }
  console.log(`  Square integration: [${square.status}]`);
  console.log("  Square guidance: Set SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID and SQUARE_ENVIRONMENT=production (or sandbox) in .env");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Press Ctrl+C to stop.");
  console.log("");

  // ── Graceful Shutdown ───────────────────────────────────────────────────
  /**
   * Handle shutdown signals (SIGINT, SIGTERM).
   */
  async function shutdown() {
    console.log("\n🛑 Shutting down Cheeky OS...");
    console.log("  👋 Cheeky OS shut down cleanly.");
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ── Direct execution: node start.js ─────────────────────────────────────────
if (require.main === module) {
  main().catch((err) => {
    console.error(`❌ Startup failed: ${err.message}`);
    if (err && err.stack) console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  });
}

module.exports = { main };
