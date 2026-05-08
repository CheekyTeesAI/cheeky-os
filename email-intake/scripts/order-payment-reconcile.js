#!/usr/bin/env node
/**
 * Cheeky OS — order/payment reconciliation (read-only, DB truth only).
 *
 * Scans a bounded slice of recently updated orders and applies explicit mismatch rules.
 * Does not call Square APIs; does not mutate data.
 *
 * Usage:
 *   node scripts/order-payment-reconcile.js
 *   node scripts/order-payment-reconcile.js --limit 25
 *   node scripts/order-payment-reconcile.js --recentDays 7
 */

const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

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
  const out = { limit: 50, recentDays: 14 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        if (key === "limit" || key === "recentDays") {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            out[key] = Math.min(Math.floor(n), key === "limit" ? 500 : 365);
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

/**
 * @returns {{ key: string, detail: string }[]}
 */
function classify(o) {
  if (o.status === "CANCELLED") return [];

  const reasons = [];
  const st = String(o.status || "");
  const paid = Number(o.amountPaid) || 0;
  const total = Number(o.totalAmount) || 0;
  const depStore = Number(o.depositAmount) || 0;

  if (depStore > total + EPS && total >= 0) {
    reasons.push({
      key: "deposit_gt_total",
      detail:
        "likely mismatch: depositAmount exceeds totalAmount (numeric inconsistency)",
    });
  }

  if (paid > total + EPS) {
    reasons.push({
      key: "amount_paid_gt_total",
      detail:
        "likely mismatch: amountPaid greater than totalAmount (needs review)",
    });
  }

  const fullAmt = effectiveFullAmount(o);
  if (
    fullAmt != null &&
    fullAmt > 0 &&
    paid + EPS >= fullAmt &&
    st !== "PAID_IN_FULL"
  ) {
    reasons.push({
      key: "full_amount_vs_status",
      detail:
        "amountPaid meets/exceeds quoted or total ceiling but status is not PAID_IN_FULL (stale-looking)",
    });
  }

  const depNeed = depositThreshold(o);
  if (
    depNeed > 0 &&
    paid + EPS >= depNeed &&
    !o.depositPaidAt &&
    !["DEPOSIT_PAID", "PAID_IN_FULL"].includes(st)
  ) {
    reasons.push({
      key: "deposit_threshold_vs_ledger",
      detail:
        "deposit threshold likely met (amountPaid vs deposit rule) but status/depositPaidAt not aligned (needs review)",
    });
  }

  if (paid > EPS && PRE_PAYMENT.has(st)) {
    reasons.push({
      key: "money_with_pre_payment_status",
      detail:
        "amountPaid > 0 while status is still pre-payment workflow (likely stale)",
    });
  }

  if (o.squarePaymentId && PRE_PAYMENT.has(st)) {
    reasons.push({
      key: "payment_ref_pre_payment_status",
      detail:
        "squarePaymentId present but status still pre-payment (stale-looking)",
    });
  }

  if (
    o.squarePaymentId &&
    !o.squareInvoiceId &&
    !o.squareInvoiceNumber
  ) {
    reasons.push({
      key: "payment_ref_without_invoice_ref",
      detail:
        "payment ref without invoice id/number on order (may be valid for some flows — verify)",
    });
  }

  if (PAID_TIER.has(st) && !hasAnySquareRef(o)) {
    reasons.push({
      key: "paid_tier_status_no_square_refs",
      detail:
        "status suggests paid/deposit tier but no Square invoice/order/payment refs (needs review)",
    });
  }

  return reasons;
}

function refsLine(o) {
  return [
    o.squareInvoiceId ? "inv" : "-",
    o.squareOrderId ? "ord" : "-",
    o.squarePaymentId ? "pay" : "-",
  ].join("/");
}

async function main() {
  const { limit, recentDays } = parseArgs(process.argv);
  const since = new Date(Date.now() - recentDays * 86400000);

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      updatedAt: { gte: since },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
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

  const bucketCounts = {};
  const flagged = [];

  for (const o of orders) {
    const reasons = classify(o);
    if (reasons.length) {
      flagged.push({ order: o, reasons });
      for (const r of reasons) {
        bucketCounts[r.key] = (bucketCounts[r.key] || 0) + 1;
      }
    }
  }

  const bucketMeta = [
    {
      key: "deposit_gt_total",
      name: "depositAmount > totalAmount",
      explain:
        "Stored deposit exceeds total; usually data entry or partial migration.",
    },
    {
      key: "amount_paid_gt_total",
      name: "amountPaid > totalAmount",
      explain:
        "Recorded payments exceed stored total; verify totals and refunds.",
    },
    {
      key: "full_amount_vs_status",
      name: "Full pay vs PAID_IN_FULL",
      explain:
        "amountPaid reached quoted/total ceiling but status not PAID_IN_FULL.",
    },
    {
      key: "deposit_threshold_vs_ledger",
      name: "Deposit threshold vs status",
      explain:
        "amountPaid crossed deposit rule but depositPaidAt/status not aligned.",
    },
    {
      key: "money_with_pre_payment_status",
      name: "Money with pre-payment status",
      explain: "amountPaid > 0 while status is still quote/intake style.",
    },
    {
      key: "payment_ref_pre_payment_status",
      name: "Payment ref + pre-payment status",
      explain: "squarePaymentId exists but workflow status still pre-payment.",
    },
    {
      key: "payment_ref_without_invoice_ref",
      name: "Payment ref without invoice ref",
      explain: "Payment id without invoice id/number on row (may be OK).",
    },
    {
      key: "paid_tier_status_no_square_refs",
      name: "Paid-tier status, no Square refs",
      explain:
        "PAID / DEPOSIT_PAID / PAID_IN_FULL without any Square linkage fields.",
    },
  ];

  console.log("");
  console.log("=== CHEEKY OS ORDER/PAYMENT RECONCILIATION ===");
  console.log("");
  console.log("1. Scan Summary");
  console.log(`- total orders scanned: ${orders.length}`);
  console.log(
    `- total records with at least one mismatch signal: ${flagged.length}`
  );
  console.log(
    "- unavailable signals: Square Dashboard / live payment totals not queried here (DB-only); finalPaidAt/depositReceived not used in rules (optional follow-up)"
  );
  console.log(
    `- scan bounds: updatedAt within last ${recentDays} days, newest first, max ${limit} rows`
  );
  console.log("");

  console.log("2. Mismatch buckets");
  for (const b of bucketMeta) {
    const c = bucketCounts[b.key] || 0;
    console.log(`- ${b.name}`);
    console.log(`  count (signals in scan): ${c}`);
    console.log(`  ${b.explain}`);
  }
  console.log("");

  console.log("3. Flagged records");
  if (!flagged.length) {
    console.log("  (none in this scan)");
  } else {
    for (const { order: o, reasons } of flagged) {
      const label = o.orderNumber || o.id;
      console.log(`  ---`);
      console.log(`  order: ${label}  id=${o.id}`);
      console.log(`  status: ${o.status}`);
      console.log(`  totalAmount: ${o.totalAmount}  depositAmount: ${o.depositAmount}  amountPaid: ${o.amountPaid}`);
      console.log(`  quotedAmount: ${o.quotedAmount ?? "(n/a)"}  depositRequired: ${o.depositRequired ?? "(n/a)"}`);
      console.log(`  refs inv/ord/pay: ${refsLine(o)}`);
      console.log(`  reasons (${reasons.length}):`);
      for (const r of reasons) {
        console.log(`    - [${r.key}] ${r.detail}`);
      }
    }
  }
  console.log("");

  console.log("4. Suggested follow-up");
  console.log("- For a specific row: node scripts/order-state-audit.js --orderId <uuid> (or orderNumber / Square ids).");
  console.log("- Use manual repair only after audit confirms intended target state.");
  console.log("- If many stale payment rows appear, verify webhook delivery and ProcessedWebhookEvent idempotency.");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
