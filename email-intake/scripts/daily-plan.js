#!/usr/bin/env node
/**
 * Operator daily execution list — read-only suggestions (no automation).
 */

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");
const { logAction } = require(path.join(__dirname, "..", "src", "lib", "systemLog.js"));

loadDotenvFromEmailIntake();

function main() {
  logAction({ action: "daily_plan_view", detail: {} });

  console.log("");
  console.log("=== CHEEKY OS — DAILY PLAN (manual execution) ===");
  console.log("");
  console.log("1. Money path:  node scripts/operator.js reconcile --limit 25");
  console.log("2. Revenue view: node scripts/operator.js revenue --limit 60");
  console.log("3. Follow-ups:   node scripts/operator.js followups --limit 40");
  console.log("4. Send queue:   node scripts/operator.js sendqueue list");
  console.log("5. VIP drafts:   node scripts/operator.js vipdrafts --perTier 8");
  console.log("6. Quote accel:  node scripts/operator.js quoteaccel --perType 15");
  console.log("7. Simulation:   node scripts/operator.js simulate");
  console.log("8. System:       node scripts/operator.js overview");
  console.log("");
  console.log("No auto-send — confirm each outreach in your workflow.");
  console.log("");
}

main();
