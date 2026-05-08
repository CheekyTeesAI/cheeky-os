#!/usr/bin/env node
/**
 * Cheeky OS — operator-approved send queue (file-backed, no auto-send).
 *
 * Queue file: outputs/send-queue/queue.json
 * mark-sent only updates local state — does not call Resend/email APIs.
 *
 * Usage:
 *   node scripts/send-queue.js list
 *   node scripts/send-queue.js add --file <outreach-draft.json>
 *   node scripts/send-queue.js approve --id <sq_...> --by "Operator Name"
 *   node scripts/send-queue.js block --id <sq_...> --reason "..."
 *   node scripts/send-queue.js queue --id <sq_...> [--force]
 *   node scripts/send-queue.js mark-sent --id <sq_...>
 *   node scripts/send-queue.js reopen --id <sq_...>
 */

require("ts-node/register/transpile-only");

const fs = require("fs");
const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const baseDir = path.join(__dirname, "..");

const {
  loadQueue,
  enqueueFromOutreachDraft,
  approveEntry,
  blockEntry,
  queueForSend,
  markSent,
  listEntries,
  reopenDraftReview,
  queueFilePath,
} = require(path.join(__dirname, "..", "src", "lib", "sendQueue.ts"));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function printHelp() {
  console.log("");
  console.log("=== CHEEKY OS SEND QUEUE (operator-approved, file-backed) ===");
  console.log("");
  console.log(`Queue file: ${queueFilePath(baseDir)}`);
  console.log("No automatic sends. mark-sent is label-only (no email API).");
  console.log("");
  console.log("Commands: list | add | approve | block | queue | mark-sent | reopen");
  console.log("");
}

function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printHelp();
    process.exitCode = cmd ? 0 : 1;
    return;
  }

  if (cmd === "list") {
    const state = args.state;
    const rows = listEntries(baseDir, state ? { state } : undefined);
    console.log("");
    console.log(`Entries: ${rows.length}`);
    rows.forEach((e, i) => {
      console.log("");
      console.log(
        `${i + 1}. [${e.state}] ${e.id} | ${e.type} | ${e.customerEmail || "no email"}`
      );
      console.log(`   Subject: ${e.subject}`);
      console.log(`   reviewRequired=${e.reviewRequired}`);
      if (e.blockedReason) console.log(`   blocked: ${e.blockedReason}`);
    });
    console.log("");
    return;
  }

  if (cmd === "add") {
    const file = args.file;
    if (!file || !fs.existsSync(file)) {
      console.error("send-queue: add requires --file <path-to-json> (OutreachDraft shape)");
      process.exitCode = 1;
      return;
    }
    const raw = fs.readFileSync(file, "utf8");
    const draft = JSON.parse(raw);
    const entry = enqueueFromOutreachDraft(baseDir, draft);
    console.log("");
    console.log(`Queued as DRAFT_REVIEW: ${entry.id}`);
    console.log("");
    return;
  }

  if (cmd === "approve") {
    const id = args.id;
    const by = args.by || "operator";
    if (!id) {
      console.error("send-queue: approve requires --id");
      process.exitCode = 1;
      return;
    }
    const e = approveEntry(baseDir, id, by);
    console.log(`Approved: ${e.id} state=${e.state}`);
    return;
  }

  if (cmd === "block") {
    const id = args.id;
    const reason = args.reason || "blocked by operator";
    if (!id) {
      console.error("send-queue: block requires --id");
      process.exitCode = 1;
      return;
    }
    const e = blockEntry(baseDir, id, reason);
    console.log(`Blocked: ${e.id}`);
    return;
  }

  if (cmd === "queue") {
    const id = args.id;
    const force = !!args.force;
    if (!id) {
      console.error("send-queue: queue requires --id [--force]");
      process.exitCode = 1;
      return;
    }
    const e = queueForSend(baseDir, id, { force });
    console.log(`Ready for send (label): ${e.id} state=${e.state}`);
    return;
  }

  if (cmd === "mark-sent") {
    const id = args.id;
    if (!id) {
      console.error("send-queue: mark-sent requires --id");
      process.exitCode = 1;
      return;
    }
    const e = markSent(baseDir, id);
    console.log(`Marked SENT (local label only): ${e.id}`);
    return;
  }

  if (cmd === "reopen") {
    const id = args.id;
    if (!id) {
      console.error("send-queue: reopen requires --id");
      process.exitCode = 1;
      return;
    }
    const e = reopenDraftReview(baseDir, id);
    console.log(`Reopened to DRAFT_REVIEW: ${e.id}`);
    return;
  }

  console.error(`send-queue: unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
