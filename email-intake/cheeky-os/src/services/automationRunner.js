"use strict";

let running = false;
let timer = null;

function withTimeout(work, ms) {
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

async function runAutomationCycle() {
  if (running) return;
  running = true;
  console.log("[AUTOMATION RUN]");
  try {
    await withTimeout(async () => {
      try {
        const { runAutoOperator } = require(pathJoinRoot("src/services/autoOperator"));
        const { runAutoFollowups } = require(pathJoinRoot("src/services/autoFollowupEngine"));
        const { runFullAuto } = require(pathJoinRoot("src/services/fullAutoEngine"));
        const { runRevenueFollowupScan } = require(pathJoinRoot("src/services/revenueFollowupService"));
        const { importRecentOrders } = require(pathJoinRoot("src/services/squareImportService"));
        if (typeof importRecentOrders === "function") {
          await importRecentOrders({ limit: 10 });
        }
        if (typeof runAutoOperator === "function") {
          await runAutoOperator();
        }
        if (typeof runAutoFollowups === "function") {
          await runAutoFollowups();
        }
        if (typeof runFullAuto === "function") {
          await runFullAuto();
        }
        if (typeof runRevenueFollowupScan === "function") {
          await runRevenueFollowupScan();
        }
      } catch (innerErr) {
        console.log("[AUTOMATION SAFE FAIL]", innerErr && innerErr.message ? innerErr.message : innerErr);
      }
    }, 10000);
  } catch (err) {
    console.log("[AUTOMATION SAFE FAIL]", err && err.message ? err.message : err);
  } finally {
    running = false;
  }
}

function pathJoinRoot(relativePath) {
  const path = require("path");
  return path.join(__dirname, "..", "..", "..", "..", relativePath);
}

function startAutomation() {
  if (process.env.AUTOMATION_CRON_ENABLED !== "true") return;
  if (timer) return;
  const configured = parseInt(
    process.env.FULL_AUTO_INTERVAL_MS ||
      process.env.FOLLOWUP_INTERVAL_MS ||
      process.env.AUTOMATION_INTERVAL_MS ||
      "60000",
    10
  );
  const interval = Number.isFinite(configured) ? Math.max(60000, configured) : 60000;
  timer = setInterval(() => {
    runAutomationCycle().catch((err) => {
      console.log("[AUTOMATION SAFE FAIL]", err && err.message ? err.message : err);
    });
  }, interval);
}

module.exports = { startAutomation, runAutomationCycle };
