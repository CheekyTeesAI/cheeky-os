"use strict";

/**
 * Run without server: exercises parser + router + handlers.
 * Usage: node scripts/testCommand.js  (cwd: email-intake)
 */

const { parseCommand } = require("../lib/commandParser");
const { routeCommand } = require("../lib/router");
const memory = require("../lib/memory");

memory.ensureStructure();

const samples = [
  "create estimate for ray thompson karate 50 shirts",
  "create estimate for hvac company 24 shirts",
  "send follow up email to john",
  "find unpaid invoices",
  "what should I work on today",
];

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Cheeky OS — command layer test (local) ║");
  console.log("╚══════════════════════════════════════════╝\n");

  for (const input of samples) {
    console.log("─────────────────────────────────────────");
    console.log("INPUT:", input);
    const parsed = parseCommand(input);
    console.log("PARSED →", parsed.type, "|", parsed.entity, "|", parsed.data);
    const result = await routeCommand(parsed);
    console.log("ACTION RESULT →", result);
    console.log("");
  }

  console.log("Done. Check email-intake/memory/log.md for entries.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
