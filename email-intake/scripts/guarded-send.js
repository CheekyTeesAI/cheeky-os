#!/usr/bin/env node
/**
 * Cheeky OS — guarded batch send (operator-triggered only; no auto-send).
 *
 * Uses lib/integrations/outlook.js sendEmail (Resend when configured).
 * Stub / misconfiguration → FAILED with message (never silent SENT).
 *
 * Requires --confirm YES for any send or retry.
 * reviewRequired rows need --allow-review-required in addition.
 *
 * Usage:
 *   node scripts/guarded-send.js list-sendable
 *   node scripts/guarded-send.js send-one --id <sq_...> --confirm YES
 *   node scripts/guarded-send.js send-batch --limit 5 --confirm YES
 *   node scripts/guarded-send.js retry --id <sq_...> --confirm YES   # FAILED → QUEUED
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const baseDir = path.join(__dirname, "..");

const { sendEmail } = require(path.join(
  __dirname,
  "..",
  "lib",
  "integrations",
  "outlook.js"
));

const {
  getEntryById,
  listSendableEntries,
  recordSendOutcome,
  retryFailedToQueued,
  queueFilePath,
} = require(path.join(__dirname, "..", "src", "lib", "sendQueue.ts"));

const MAX_BATCH = 10;
const DEFAULT_BATCH = 5;

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

function assertConfirm(v, label) {
  if (String(v ?? "").trim().toUpperCase() !== "YES") {
    throw new Error(`${label} must be exactly YES`);
  }
}

function printHelp() {
  console.log("");
  console.log("=== CHEEKY OS GUARDED SEND (operator-triggered) ===");
  console.log("");
  console.log(`Queue: ${queueFilePath(baseDir)}`);
  console.log(`Max batch: ${MAX_BATCH} (default ${DEFAULT_BATCH})`);
  console.log("Sends only QUEUED rows. Requires --confirm YES.");
  console.log("reviewRequired rows also need --allow-review-required.");
  console.log("");
}

async function sendQueuedEntry(entry, opts) {
  const allowRR = !!opts.allowReviewRequired;
  if (entry.reviewRequired && !allowRR) {
    throw new Error(
      "Entry has reviewRequired — add --allow-review-required after manual review"
    );
  }
  const to = entry.customerEmail && String(entry.customerEmail).trim();
  if (!to || !to.includes("@")) {
    recordSendOutcome(baseDir, entry.id, "FAILED", {
      errorMessage: "missing or invalid customerEmail",
    });
    throw new Error("missing or invalid customerEmail (recorded FAILED)");
  }

  let result;
  try {
    result = await sendEmail({
      to,
      subject: entry.subject || "Cheeky Tees follow-up",
      body: entry.body || "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSendOutcome(baseDir, entry.id, "FAILED", { errorMessage: msg });
    return {
      ok: false,
      entry,
      result: { success: false, message: msg },
      recorded: "FAILED",
    };
  }

  if (!result.success) {
    const msg = result.message || result.error || "send failed";
    recordSendOutcome(baseDir, entry.id, "FAILED", { errorMessage: String(msg) });
    return { ok: false, entry, result, recorded: "FAILED" };
  }

  if (result.mode === "stub") {
    recordSendOutcome(baseDir, entry.id, "FAILED", {
      errorMessage:
        "stub mode — Resend/outlook not live; configure RESEND_API_KEY. Not marking SENT.",
    });
    return { ok: false, entry, result, recorded: "FAILED" };
  }

  recordSendOutcome(baseDir, entry.id, "SENT");
  return { ok: true, entry, result, recorded: "SENT" };
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printHelp();
    process.exitCode = cmd ? 0 : 1;
    return;
  }

  if (cmd === "list-sendable") {
    const rows = listSendableEntries(baseDir);
    console.log("");
    console.log(`Sendable (QUEUED): ${rows.length}`);
    rows.forEach((e, i) => {
      console.log(
        `${i + 1}. ${e.id} | ${e.customerEmail || "?"} | reviewRequired=${e.reviewRequired}`
      );
      console.log(`   ${e.subject}`);
    });
    console.log("");
    return;
  }

  if (cmd === "retry") {
    assertConfirm(args.confirm, "--confirm");
    const id = args.id;
    if (!id) throw new Error("retry requires --id");
    const e = retryFailedToQueued(baseDir, id);
    console.log(`Retry: ${e.id} → QUEUED (ready for guarded send again)`);
    return;
  }

  if (cmd === "send-one") {
    assertConfirm(args.confirm, "--confirm");
    const id = args.id;
    if (!id) throw new Error("send-one requires --id");
    const allowRR = !!args["allow-review-required"];
    const entry = getEntryById(baseDir, id);
    if (!entry) throw new Error("entry not found");
    if (entry.state !== "QUEUED") {
      throw new Error(`entry must be QUEUED (is ${entry.state})`);
    }
    const r = await sendQueuedEntry(entry, {
      allowReviewRequired: allowRR,
    });
    console.log("");
    console.log(
      r.ok
        ? `SENT OK: ${entry.id}`
        : `NOT SENT: ${entry.id} recorded=${r.recorded}`
    );
    if (r.result && !r.ok) console.log(`Detail: ${JSON.stringify(r.result)}`);
    console.log("");
    return;
  }

  if (cmd === "send-batch") {
    assertConfirm(args.confirm, "--confirm");
    const allowRR = !!args["allow-review-required"];
    let lim = parseInt(String(args.limit || DEFAULT_BATCH), 10);
    if (!Number.isFinite(lim) || lim < 1) lim = DEFAULT_BATCH;
    lim = Math.min(lim, MAX_BATCH);

    const queue = listSendableEntries(baseDir).slice(0, lim);
    console.log("");
    console.log(`Batch up to ${lim} (have ${queue.length} QUEUED)`);

    const results = [];
    for (const entry of queue) {
      if (entry.reviewRequired && !allowRR) {
        console.log(`SKIP ${entry.id} reviewRequired (no --allow-review-required)`);
        results.push({ id: entry.id, skipped: true });
        continue;
      }
      try {
        const r = await sendQueuedEntry(entry, { allowReviewRequired: allowRR });
        results.push({
          id: entry.id,
          ok: r.ok,
          recorded: r.recorded,
        });
        console.log(
          r.ok ? `OK ${entry.id} → SENT` : `FAIL ${entry.id} → ${r.recorded}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`ERROR ${entry.id}: ${msg}`);
        results.push({ id: entry.id, error: msg });
      }
    }
    console.log("");
    console.log("Summary:", JSON.stringify(results, null, 2));
    console.log("");
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
