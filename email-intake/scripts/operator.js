#!/usr/bin/env node
/**
 * Cheeky OS — thin operator CLI: dispatches to scripts in this folder.
 * Does not contain business logic; forwards argv and preserves exit codes.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const SCRIPT_DIR = __dirname;

/** Subcommand name -> script filename (must live in SCRIPT_DIR). */
const DISPATCH = {
  report: "money-path-report.js",
  reconcile: "order-payment-reconcile.js",
  audit: "order-state-audit.js",
  export: "money-path-export.js",
  smoke: "smoke-test.js",
  overview: "system-status.js",
  simulate: "revenue-loop-simulation.js",
  plan: "daily-plan.js",
  queue: "send-queue.js",
  daily: "daily-status.js",
  incidents: "daily-incident-summary.js",
  batch: "batch-review.js",
  overnight: "overnight-ops-digest.js",
  followups: "follow-up-targets.js",
  reactivation: "reactivation-drafts.js",
  vip: "vip-recovery.js",
  vipdrafts: "vip-recovery-drafts.js",
  quoteaccel: "quote-acceleration.js",
  revenue: "revenue-command-center.js",
  sendqueue: "send-queue.js",
  guarded: "guarded-send.js",
};

const REPAIR_SCRIPT = "order-state-repair.js";

function scriptPath(file) {
  return path.join(SCRIPT_DIR, file);
}

function printHelp() {
  const repairNote = fs.existsSync(scriptPath(REPAIR_SCRIPT))
    ? `repair       Perform guarded manual state repair (${REPAIR_SCRIPT})`
    : `repair       Not available (${REPAIR_SCRIPT} not present in this repo)`;

  console.log("");
  console.log("=== CHEEKY OS OPERATOR COMMANDS ===");
  console.log("report       Run money-path summary report (money-path-report.js)");
  console.log("reconcile    Run order/payment reconciliation (order-payment-reconcile.js)");
  console.log("audit        Audit a specific order/payment reference (order-state-audit.js)");
  console.log(repairNote);
  console.log("export       Export flagged records for review (money-path-export.js)");
  console.log("smoke        Run system smoke checks (smoke-test.js)");
  console.log("overview     Environment + module snapshot (system-status.js)");
  console.log("simulate     Revenue loop preview — ranked merge, no actions (revenue-loop-simulation.js)");
  console.log("plan         Suggested daily execution list (daily-plan.js)");
  console.log("queue        Alias: operator-approved send queue (send-queue.js)");
  console.log("daily        Daily money-path + health snapshot (daily-status.js)");
  console.log("incidents    Daily incident-oriented risk summary (daily-incident-summary.js)");
  console.log("batch        Guided batch review of flagged orders (batch-review.js, read-only)");
  console.log("overnight    Overnight ops digest — intake / money / production snapshot (read-only)");
  console.log("followups    Sales follow-up targets 2.0 — ranked read-only list (no sends)");
  console.log("reactivation Reactivation email + call-script drafts (read-only, no sends)");
  console.log("vip          VIP / whale dormant recovery ranking (read-only)");
  console.log("vipdrafts    VIP recovery email + owner-call drafts + advisory offer angles (draft-only)");
  console.log("quoteaccel   Quote refresh + reorder acceleration ranking (read-only)");
  console.log("revenue      Revenue command center — one-screen opportunity + send snapshot (read-only)");
  console.log("sendqueue    Operator-approved send queue (file-backed; no auto-send)");
  console.log("guarded      Guarded send — QUEUED items only, requires --confirm YES");
  console.log("");
  console.log("Examples:");
  console.log("- node scripts/operator.js report");
  console.log("- node scripts/operator.js reconcile --limit 25");
  console.log("- node scripts/operator.js audit --orderNumber 1234");
  console.log(
    "- node scripts/operator.js repair --orderNumber 1234 --action set-status --value DEPOSIT_PAID --write --confirm YES"
  );
  console.log("- node scripts/operator.js export --recentDays 7");
  console.log("- node scripts/operator.js smoke");
  console.log("- node scripts/operator.js overview");
  console.log("- node scripts/operator.js simulate");
  console.log("- node scripts/operator.js plan");
  console.log("- node scripts/operator.js queue list");
  console.log("- node scripts/operator.js daily");
  console.log("- node scripts/operator.js incidents");
  console.log("- node scripts/operator.js batch --limit 15");
  console.log("- node scripts/operator.js overnight --hours 12");
  console.log("- node scripts/operator.js followups --limit 40");
  console.log("- node scripts/operator.js reactivation --limit 40");
  console.log("- node scripts/operator.js vip --perTier 20");
  console.log("- node scripts/operator.js vipdrafts --perTier 8");
  console.log("- node scripts/operator.js quoteaccel --perType 18");
  console.log("- node scripts/operator.js revenue --limit 60");
  console.log("- node scripts/operator.js sendqueue list");
  console.log("- node scripts/operator.js guarded list-sendable");
  console.log("");
}

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const rest = argv.slice(1);

  if (!sub || sub === "-h" || sub === "--help") {
    printHelp();
    process.exitCode = !sub ? 1 : 0;
    return;
  }

  let targetFile = null;
  if (sub === "repair") {
    const p = scriptPath(REPAIR_SCRIPT);
    if (!fs.existsSync(p)) {
      console.error(
        `operator: subcommand "repair" is unavailable (${REPAIR_SCRIPT} not found).`
      );
      process.exitCode = 1;
      return;
    }
    targetFile = REPAIR_SCRIPT;
  } else {
    targetFile = DISPATCH[sub];
  }

  if (!targetFile) {
    console.error(`operator: unknown subcommand: ${sub}`);
    console.error("");
    printHelp();
    process.exitCode = 1;
    return;
  }

  const targetPath = scriptPath(targetFile);
  if (!fs.existsSync(targetPath)) {
    console.error(`operator: missing script: ${targetFile}`);
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, [targetPath, ...rest], {
    stdio: "inherit",
    windowsHide: true,
  });

  child.on("error", (err) => {
    console.error(err);
    process.exitCode = 1;
  });

  child.on("close", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code === null ? 1 : code;
  });
}

main();
