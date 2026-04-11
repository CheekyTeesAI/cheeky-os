// PHASE 5 — STARTUP SCRIPT: email poller launcher
/**
 * Unified startup script for the Cheeky Tees intake system.
 * Starts the email poller (Graph API) in a single process.
 * For HTTP API use: npm start (Cheeky OS Express).
 *
 * Run as: node start.js
 *
 * Graceful shutdown on SIGINT/SIGTERM (Ctrl+C).
 *
 * @module start
 */

require('dotenv').config({
  path: require('path').join(__dirname, '.env')
});

console.log("🔥 USING THIS FILE: square-client.js");
const fs = require("fs");
const path = require("path");
const { initializeSquareIntegration, getSquareIntegrationStatus } = require("./cheeky-os/integrations/square");
const { printStartupEnvHints, getEngineReadinessFlags } = require("./cheeky-os/safety/startup-env");

/** Ensure logs directory exists. */
fs.mkdirSync(path.join(__dirname, "logs"), { recursive: true });

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
 * Main startup function. Starts email poller, then listens for shutdown signals.
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
  console.log("  HTTP API:          use `npm start` (legacy webhook server removed)");

  // ── Start Email Poller ──────────────────────────────────────────────────
  let pollerStarted = false;
  const hasGraphConfig =
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.OUTLOOK_USER_EMAIL;

  if (hasGraphConfig) {
    try {
      const { startPolling } = require("./email-listener/email-poller");
      startPolling();
      pollerStarted = true;
      console.log(`  ✅ Email poller running (mailbox: ${process.env.OUTLOOK_USER_EMAIL})`);
    } catch (err) {
      console.error(`  ❌ Email poller failed to start: ${err.message}`);
      console.log("     (continuing without email polling — fix config and restart)");
    }
  } else {
    console.log("  ⚠️  Email poller SKIPPED — missing Graph API config:");
    if (!process.env.AZURE_TENANT_ID) console.log("     → AZURE_TENANT_ID");
    if (!process.env.AZURE_CLIENT_ID) console.log("     → AZURE_CLIENT_ID");
    if (!process.env.AZURE_CLIENT_SECRET) console.log("     → AZURE_CLIENT_SECRET");
    if (!process.env.OUTLOOK_USER_EMAIL) console.log("     → OUTLOOK_USER_EMAIL");
    console.log("     Set these in .env to enable email auto-intake.");
  }

  // ── Startup Summary ─────────────────────────────────────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  📊 CHEEKY OS — Startup Summary");
  console.log(`  Email Poller:    ${pollerStarted ? "✅ RUNNING" : "⚠️  SKIPPED"}`);
  console.log(`  Manual Intake:   node intake.js (always available)`);
  console.log(`  Column Check:    node dataverse/column-check.js`);
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
   * Handle shutdown signals (SIGINT, SIGTERM). Stops email poller gracefully before exiting.
   */
  async function shutdown() {
    console.log("\n🛑 Shutting down Cheeky OS...");

    if (pollerStarted) {
      try {
        const { stopPolling } = require("./email-listener/email-poller");
        stopPolling();
        console.log("  ✅ Email poller stopped.");
      } catch (err) {
        console.error(`  ❌ Poller shutdown error: ${err.message}`);
      }
    }

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
