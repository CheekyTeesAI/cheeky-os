#!/usr/bin/env node
/**
 * Cheeky OS — guided batch review for reconcile-flagged orders (read-only; no auto-repair).
 *
 * Sources orders from a bounded window (same heuristics as order-payment-reconcile classify).
 * Optional: run `order-state-audit.js` for the current row (still read-only).
 *
 * Usage:
 *   node scripts/batch-review.js
 *   node scripts/batch-review.js --limit 20 --recentDays 14
 */

const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EPS = 1e-6;

const PRE_PAYMENT = new Set([
  "INTAKE",
  "QUOTE_READY",
  "APPROVED",
  "INVOICE_DRAFTED",
]);

const PAID_TIER = new Set(["PAID", "DEPOSIT_PAID", "PAID_IN_FULL"]);

function parseArgs(argv) {
  const out = { limit: 15, recentDays: 14, pool: 400 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        if (key === "limit" || key === "recentDays" || key === "pool") {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            if (key === "limit") {
              out.limit = Math.min(Math.floor(n), 50);
            } else if (key === "recentDays") {
              out.recentDays = Math.min(Math.floor(n), 90);
            } else {
              out.pool = Math.min(Math.floor(n), 2000);
            }
          }
        }
        i++;
      }
    }
  }
  return out;
}

function hasAnySquareRef(o) {
  return !!(o.squareInvoiceId || o.squareOrderId || o.squarePaymentId);
}

function depositThreshold(o) {
  if (o.depositRequired != null && Number.isFinite(o.depositRequired)) {
    return o.depositRequired;
  }
  const q = o.quotedAmount;
  if (q != null && q > 0) return q * 0.5;
  if (o.depositAmount != null && o.depositAmount > 0) return o.depositAmount;
  return 0;
}

function effectiveFullAmount(o) {
  if (o.quotedAmount != null && o.quotedAmount > 0) return o.quotedAmount;
  if (o.totalAmount != null && o.totalAmount > 0) return o.totalAmount;
  return null;
}

function classify(o) {
  if (o.status === "CANCELLED") return [];
  const reasons = [];
  const st = String(o.status || "");
  const paid = Number(o.amountPaid) || 0;
  const total = Number(o.totalAmount) || 0;
  const depStore = Number(o.depositAmount) || 0;

  if (depStore > total + EPS && total >= 0) reasons.push("deposit_gt_total");
  if (paid > total + EPS) reasons.push("amount_paid_gt_total");
  const fullAmt = effectiveFullAmount(o);
  if (
    fullAmt != null &&
    fullAmt > 0 &&
    paid + EPS >= fullAmt &&
    st !== "PAID_IN_FULL"
  ) {
    reasons.push("full_amount_vs_status");
  }
  const depNeed = depositThreshold(o);
  if (
    depNeed > 0 &&
    paid + EPS >= depNeed &&
    !o.depositPaidAt &&
    !["DEPOSIT_PAID", "PAID_IN_FULL"].includes(st)
  ) {
    reasons.push("deposit_threshold_vs_ledger");
  }
  if (paid > EPS && PRE_PAYMENT.has(st)) {
    reasons.push("money_with_pre_payment_status");
  }
  if (o.squarePaymentId && PRE_PAYMENT.has(st)) {
    reasons.push("payment_ref_pre_payment_status");
  }
  if (o.squarePaymentId && !o.squareInvoiceId && !o.squareInvoiceNumber) {
    reasons.push("payment_ref_without_invoice_ref");
  }
  if (PAID_TIER.has(st) && !hasAnySquareRef(o)) {
    reasons.push("paid_tier_status_no_square_refs");
  }
  return reasons;
}

function refsLine(o) {
  return `inv=${o.squareInvoiceId ? "yes" : "no"} ord=${o.squareOrderId ? "yes" : "no"} pay=${o.squarePaymentId ? "yes" : "no"}`;
}

function auditCommand(orderId) {
  return `node scripts/order-state-audit.js --orderId ${orderId}`;
}

function runAudit(orderId) {
  const script = path.join(__dirname, "order-state-audit.js");
  spawnSync(process.execPath, [script, "--orderId", orderId], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    windowsHide: true,
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  const { limit, recentDays, pool } = parseArgs(process.argv);
  const since = new Date(Date.now() - recentDays * 86400000);

  const candidates = await prisma.order.findMany({
    where: { deletedAt: null, updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: pool,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      depositAmount: true,
      quotedAmount: true,
      depositRequired: true,
      amountPaid: true,
      depositPaidAt: true,
      squareInvoiceId: true,
      squareInvoiceNumber: true,
      squareOrderId: true,
      squarePaymentId: true,
      updatedAt: true,
    },
  });

  const batch = [];
  for (const o of candidates) {
    const flags = classify(o);
    if (flags.length) {
      batch.push({ order: o, flags });
      if (batch.length >= limit) break;
    }
  }

  console.log("");
  console.log("=== CHEEKY OS BATCH REVIEW ===");
  console.log("");
  console.log(
    `Source: reconcile-style flags, updatedAt within ${recentDays}d, scan up to ${pool} rows, showing up to ${limit} flagged.`
  );
  console.log("");

  if (batch.length === 0) {
    console.log("No records to review.");
    console.log("");
    return;
  }

  if (!process.stdin.isTTY) {
    console.log("Non-interactive terminal: listing batch only.");
    batch.forEach((b, i) => {
      const o = b.order;
      console.log(`${i + 1}. ${o.orderNumber || o.id}  ${o.status}  ${b.flags.join(",")}`);
      console.log(`   ${auditCommand(o.id)}`);
    });
    console.log("");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let idx = 0;
  while (idx < batch.length) {
    const { order: o, flags } = batch[idx];
    const n = batch.length;
    const cur = idx + 1;

    console.log("");
    console.log(`Record ${cur} of ${n}`);
    console.log(`Order:    ${o.orderNumber || "(no number)"}  id=${o.id}`);
    console.log(`Status:   ${o.status}`);
    console.log(`Refs:     ${refsLine(o)}`);
    console.log(`Flags:    ${flags.join(", ")}`);
    console.log("");
    console.log("Suggested action:");
    console.log(`- Run audit: ${auditCommand(o.id)}`);
    console.log("- Repair: not from this tool — only after manual confirmation elsewhere");
    console.log("");
    console.log("Prompt: (a)udit  (s)kip / (n)ext  (e)xit");

    const raw = await question(rl, "> ");
    const c = String(raw || "")
      .trim()
      .toLowerCase()[0];

    if (c === "e") {
      console.log("Exiting batch review.");
      break;
    }
    if (c === "a") {
      console.log("(running audit — read-only)");
      runAudit(o.id);
      continue;
    }
    if (c === "s" || c === "n") {
      idx += 1;
      continue;
    }
    if (!c) {
      console.log("Enter a, s, n, or e.");
      continue;
    }
    console.log("Unknown key; use a, s, n, or e.");
  }

  if (idx >= batch.length) {
    console.log("");
    console.log("End of batch.");
  }

  rl.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
