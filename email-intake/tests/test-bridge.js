/**
 * Test suite for Bridge modules: parse-command.js, route-command.js,
 * and bridge-runner.js.
 * Uses Node's built-in test runner (node:test, node:assert).
 * All tests are self-contained — no external API calls.
 *
 * Run with: node --test tests/test-bridge.js
 */

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { parseCommand, classifyCommandType, classifyTargetArea, detectPriority, extractEntities } = require("../bridge/parse-command");
const { routeCommand, TICKETS_DIR, ERRORS_DIR } = require("../bridge/route-command");

// ── Helper: clean up test tickets after each test ──────────────────────────
const testTicketIds = [];
afterEach(() => {
  for (const id of testTicketIds) {
    const ticketPath = path.join(TICKETS_DIR, `${id}.json`);
    const errorPath = path.join(ERRORS_DIR, `${id}.json`);
    try { fs.unlinkSync(ticketPath); } catch { /* ok */ }
    try { fs.unlinkSync(errorPath); } catch { /* ok */ }
  }
  testTicketIds.length = 0;
});

describe("Bridge: parse-command.js", () => {
  // ── Test all 13 command types ──────────────────────────────────────────
  const commandTypeTests = [
    { type: "BUILD_FEATURE", cmd: "Build a quote calculator for custom orders" },
    { type: "MODIFY_FEATURE", cmd: "Update the intake pipeline to extract art file URLs" },
    { type: "CREATE_TABLE", cmd: "Create a new Dataverse table for tracking garment inventory" },
    { type: "UPDATE_TABLE", cmd: "Update table ct_orders and add column for phone number" },
    { type: "CREATE_FLOW", cmd: "Create a Power Automate flow that sends Teams alerts on new orders" },
    { type: "UPDATE_FLOW", cmd: "Update flow for order confirmation to add size breakdown" },
    { type: "CREATE_UI", cmd: "Build a customer lookup screen that searches by name" },
    { type: "FIX_BUG", cmd: "Fix the email poller — it crashes on empty bodies" },
    { type: "QUOTE_OPS", cmd: "Calculate quote margins for the Rivera jersey order" },
    { type: "SALES_OPS", cmd: "Pull customer sales list from Square" },
    { type: "PRODUCTION_OPS", cmd: "Show all production orders due this week" },
    { type: "DOCUMENT_SYSTEM", cmd: "Document the full Cheeky OS architecture" },
    { type: "UNKNOWN", cmd: "xyzzy flurbnag glorp" },
  ];

  for (const { type, cmd } of commandTypeTests) {
    it(`classifies "${cmd.slice(0, 50)}..." as ${type}`, () => {
      const ticket = parseCommand(cmd);
      assert.equal(ticket.commandType, type, `Expected ${type} but got ${ticket.commandType}`);
      assert.ok(ticket.id.startsWith("CB-"));
      assert.ok(ticket.timestamp);
      assert.ok(ticket.rawCommand);
    });
  }

  // ── Empty input ──────────────────────────────────────────────────────────
  it("handles empty string input gracefully", () => {
    const ticket = parseCommand("");
    assert.equal(ticket.commandType, "UNKNOWN");
    assert.equal(ticket.status, "UNKNOWN");
    assert.ok(ticket.id.startsWith("CB-"));
    assert.equal(ticket.rawCommand, "");
  });

  it("handles null input gracefully", () => {
    const ticket = parseCommand(null);
    assert.equal(ticket.commandType, "UNKNOWN");
    assert.equal(ticket.status, "UNKNOWN");
  });

  it("handles undefined input gracefully", () => {
    const ticket = parseCommand(undefined);
    assert.equal(ticket.commandType, "UNKNOWN");
  });

  // ── Gibberish ────────────────────────────────────────────────────────────
  it("handles gibberish input gracefully", () => {
    const ticket = parseCommand("asdf1234 jklm zxcv qwerty!!! @@##$$");
    assert.equal(ticket.commandType, "UNKNOWN");
    assert.equal(ticket.status, "UNKNOWN");
    assert.ok(ticket.id);
  });

  // ── Priority detection ───────────────────────────────────────────────────
  it("detects HIGH priority from urgency words", () => {
    assert.equal(detectPriority("urgent fix the bug now"), "HIGH");
    assert.equal(detectPriority("this is critical"), "HIGH");
    assert.equal(detectPriority("rush order needed asap"), "HIGH");
  });

  it("detects LOW priority from low-urgency words", () => {
    assert.equal(detectPriority("when you can add a notes field"), "LOW");
    assert.equal(detectPriority("low priority cleanup task"), "LOW");
    assert.equal(detectPriority("eventually get around to updating the docs"), "LOW");
  });

  it("defaults to MEDIUM priority", () => {
    assert.equal(detectPriority("add a customer lookup screen"), "MEDIUM");
  });

  // ── Entity extraction ────────────────────────────────────────────────────
  it("extracts Dataverse table references", () => {
    const entities = extractEntities("add a column to ct_orders and link to ct_customers");
    assert.ok(entities.tables.includes("ct_orders"));
    assert.ok(entities.tables.includes("ct_customers"));
  });

  it("extracts integration references", () => {
    const entities = extractEntities("pull data from square and send via outlook");
    assert.ok(entities.integrations.includes("square"));
    assert.ok(entities.integrations.includes("outlook"));
  });
});

describe("Bridge: route-command.js", () => {
  // ── Routes valid ticket to tickets/ ──────────────────────────────────────
  it("routes valid ticket to tickets/ directory", () => {
    const ticket = parseCommand("Build a production dashboard");
    testTicketIds.push(ticket.id);
    const result = routeCommand(ticket);
    assert.equal(result.routed, true);
    assert.ok(result.savedTo.includes("tickets"));
    assert.ok(fs.existsSync(result.savedTo));
    // Verify file contents
    const saved = JSON.parse(fs.readFileSync(result.savedTo, "utf-8"));
    assert.equal(saved.id, ticket.id);
  });

  // ── Routes UNKNOWN ticket to errors/ ─────────────────────────────────────
  it("routes UNKNOWN ticket to errors/ directory", () => {
    const ticket = parseCommand("xyzzy flurbnag glorp");
    testTicketIds.push(ticket.id);
    const result = routeCommand(ticket);
    assert.equal(result.routed, false);
    assert.ok(result.savedTo.includes("errors"));
    assert.ok(fs.existsSync(result.savedTo));
  });

  // ── Routing action matches command type ──────────────────────────────────
  it("routing action matches command type", () => {
    const ticket = parseCommand("Fix the date parsing bug in intake");
    testTicketIds.push(ticket.id);
    const result = routeCommand(ticket);
    assert.equal(result.routed, true);
    assert.ok(result.action.length > 0);
    assert.ok(result.message.includes(ticket.id));
  });
});

describe("Bridge: bridge-runner.js", () => {
  // ── Runs without crashing on valid input ─────────────────────────────────
  it("bridge-runner main() runs without crashing on valid input", () => {
    // Set up argv to simulate: node bridge-runner.js "Build a feature"
    const origArgv = process.argv;
    process.argv = ["node", "bridge-runner.js", "Build a test feature for validation"];
    // Capture console output
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => logs.push(args.join(" "));
    try {
      const { main } = require("../bridge/bridge-runner");
      main();
      // Should have produced output without crashing
      assert.ok(logs.length > 0, "Expected console output from bridge-runner");
    } finally {
      process.argv = origArgv;
      console.log = origLog;
      console.error = origErr;
      // Clean up the ticket that was created
      const ticketFiles = fs.readdirSync(TICKETS_DIR);
      for (const f of ticketFiles) {
        if (f.includes("test feature for validation") || true) {
          // Just clean the most recent one
        }
      }
    }
  });

  // ── Runs without crashing on empty input ─────────────────────────────────
  it("bridge-runner main() runs without crashing on empty input (shows help)", () => {
    const origArgv = process.argv;
    const origExit = process.exit;
    process.argv = ["node", "bridge-runner.js"];
    let exitCalled = false;
    process.exit = () => { exitCalled = true; };
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    try {
      // Clear cached bridge-runner module
      delete require.cache[require.resolve("../bridge/bridge-runner")];
      const { main } = require("../bridge/bridge-runner");
      main();
      // Should show help output
      assert.ok(logs.some((l) => l.includes("Usage") || l.includes("help") || l.includes("Bridge")));
    } finally {
      process.argv = origArgv;
      process.exit = origExit;
      console.log = origLog;
    }
  });
});
