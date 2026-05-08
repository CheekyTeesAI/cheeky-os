#!/usr/bin/env node
/**
 * Full revenue loop preview — read-only, no sends, no queue mutations.
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");
const { logAction } = require(path.join(__dirname, "..", "src", "lib", "systemLog.js"));
const { rankGlobalPriority } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "globalPriorityEngine.ts"
));

loadDotenvFromEmailIntake();

function main() {
  logAction({
    action: "revenue_loop_simulation",
    detail: { mode: "preview" },
  });

  const preview = rankGlobalPriority([
    {
      id: "sim-1",
      label: "Stale quote / estimate follow-up lane",
      source: "quote_acceleration",
      score: 72,
      reason: "Synthetic merge preview",
      suggestedAction: "Run quoteaccel + followups in production",
    },
    {
      id: "sim-2",
      label: "VIP / whale recovery touch",
      source: "vip_recovery",
      score: 68,
      reason: "Synthetic merge preview",
      suggestedAction: "Run vip + vipdrafts when DB available",
    },
    {
      id: "sim-3",
      label: "Near-cash balance / invoice path",
      source: "revenue_snapshot",
      score: 61,
      reason: "Synthetic merge preview",
      suggestedAction: "Run revenue + reconcile",
    },
  ]);

  console.log("");
  console.log("=== REVENUE LOOP SIMULATION (no actions taken) ===");
  console.log("");
  preview.forEach((row, i) => {
    console.log(
      `${i + 1}. [${row.source}] (${row.score}) ${row.label} — ${row.suggestedAction}`
    );
  });
  console.log("");
  console.log("Logged to system log (append-only).");
  console.log("");
}

main();
