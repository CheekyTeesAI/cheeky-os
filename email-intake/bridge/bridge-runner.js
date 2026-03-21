// PHASE 6 — CHEEKY BRIDGE v0.1: CLI entry point
/**
 * Bridge Runner — the main CLI tool for issuing commands to the
 * Cheeky OS Bridge system. Accepts a plain-English command,
 * parses it into a structured ticket, routes it, and saves the
 * ticket to disk.
 *
 * Usage:
 *   node bridge-runner.js "Build a quote calculator for custom orders"
 *   node bridge-runner.js "Fix the intake pipeline date parsing bug"
 *
 * Tickets are saved to:
 *   /bridge/tickets/{id}.json   — successfully routed commands
 *   /bridge/errors/{id}.json    — unclassifiable commands
 *
 * @module bridge/bridge-runner
 */

const { parseCommand } = require("./parse-command");
const { routeCommand, listTickets, listErrors } = require("./route-command");

/**
 * Print a structured ticket to the console in a human-readable format.
 * @param {Object} ticket - Parsed Bridge ticket.
 */
function printTicket(ticket) {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🎫 CHEEKY BRIDGE — Command Ticket");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ID:             ${ticket.id}`);
  console.log(`  Timestamp:      ${ticket.timestamp}`);
  console.log(`  Issued By:      ${ticket.issuedBy}`);
  console.log(`  Source:          ${ticket.source}`);
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  Raw Command:     ${ticket.rawCommand}`);
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  Command Type:    ${ticket.commandType}`);
  console.log(`  Target Area:     ${ticket.targetArea}`);
  console.log(`  Priority:        ${ticket.priority}`);
  console.log(`  Status:          ${ticket.status}`);
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  Action:          ${ticket.requestedAction}`);

  if (ticket.entities) {
    const { tables, flows, screens, fields, integrations } = ticket.entities;
    if (tables.length > 0) console.log(`  Tables:          ${tables.join(", ")}`);
    if (flows.length > 0) console.log(`  Flows:           ${flows.join(", ")}`);
    if (screens.length > 0) console.log(`  Screens:         ${screens.join(", ")}`);
    if (fields.length > 0) console.log(`  Fields:          ${fields.join(", ")}`);
    if (integrations.length > 0) console.log(`  Integrations:    ${integrations.join(", ")}`);
  }

  if (ticket.constraints.length > 0) {
    console.log(`  Constraints:     ${ticket.constraints.join(" | ")}`);
  }
  if (ticket.acceptanceCriteria.length > 0) {
    console.log(`  Acceptance:      ${ticket.acceptanceCriteria.join(" | ")}`);
  }
  if (ticket.recommendedNextStep) {
    console.log(`  Next Step:       ${ticket.recommendedNextStep}`);
  }
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
}

/**
 * Print a routing result to the console.
 * @param {Object} result - Routing result from routeCommand().
 */
function printRouting(result) {
  if (result.routed) {
    console.log(`  ✅ ROUTED → ${result.action}`);
  } else {
    console.log(`  ❌ NOT ROUTED → ${result.action}`);
  }
  console.log(`  💾 Saved to: ${result.savedTo}`);
  console.log("");
}

/**
 * Print a summary of all saved tickets and errors.
 */
function printSummary() {
  const tickets = listTickets();
  const errors = listErrors();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  📊 BRIDGE SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Routed Tickets:  ${tickets.length}`);
  console.log(`  Error Tickets:   ${errors.length}`);
  console.log("");

  if (tickets.length > 0) {
    console.log("  📋 Recent Tickets:");
    for (const t of tickets.slice(-5)) {
      console.log(`     ${t.id} | ${t.commandType.padEnd(18)} | ${t.priority.padEnd(6)} | ${t.rawCommand.slice(0, 50)}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.log("  ⚠️  Recent Errors:");
    for (const e of errors.slice(-5)) {
      console.log(`     ${e.id} | ${e.rawCommand.slice(0, 60)}`);
    }
    console.log("");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

/**
 * Main entry point. Reads the command from CLI args, parses, routes, saves.
 */
function main() {
  const args = process.argv.slice(2);

  // Special flags
  if (args.includes("--list") || args.includes("-l")) {
    printSummary();
    return;
  }

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log("");
    console.log("  🌉 Cheeky Bridge v0.1 — Command-to-Ticket CLI");
    console.log("");
    console.log("  Usage:");
    console.log('    node bridge-runner.js "your command here"');
    console.log('    node bridge-runner.js --from Pat --source mobile "Build a quote screen"');
    console.log("    node bridge-runner.js --list");
    console.log("    node bridge-runner.js --help");
    console.log("");
    console.log("  Options:");
    console.log("    --from <name>     Who issued the command (default: Pat)");
    console.log("    --source <src>    Where it came from: cli, mobile, chat, voice (default: cli)");
    console.log("    --list, -l        Show all saved tickets");
    console.log("    --help, -h        Show this help");
    console.log("");
    console.log("  Examples:");
    console.log('    node bridge-runner.js "Add a due date column to ct_orders"');
    console.log('    node bridge-runner.js "Fix the email poller — it crashes on empty bodies"');
    console.log('    node bridge-runner.js --from Chad --source mobile "Build a production queue dashboard"');
    console.log("");
    return;
  }

  // Parse --from and --source flags
  let issuedBy = "Pat";
  let source = "cli";
  const filteredArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) {
      issuedBy = args[i + 1];
      i++; // skip next
    } else if (args[i] === "--source" && args[i + 1]) {
      source = args[i + 1];
      i++; // skip next
    } else {
      filteredArgs.push(args[i]);
    }
  }

  const rawCommand = filteredArgs.join(" ").trim();

  if (!rawCommand) {
    console.error("❌ No command provided. Use --help for usage.");
    process.exit(1);
  }

  console.log(`\n  🎤 Command: "${rawCommand}"`);
  console.log(`  👤 From: ${issuedBy} | 📱 Source: ${source}`);

  // Step 1: Parse
  const ticket = parseCommand(rawCommand, { issuedBy, source });
  printTicket(ticket);

  // Step 2: Route and save
  const result = routeCommand(ticket);
  printRouting(result);

  // Step 3: Show summary
  printSummary();
}

module.exports = { main, printTicket, printRouting, printSummary };

// ── Direct execution: node bridge-runner.js "command" ───────────────────────
if (require.main === module) {
  main();
}
