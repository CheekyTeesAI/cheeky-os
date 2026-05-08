#!/usr/bin/env node
/**
 * Cheeky OS — daily incident-oriented snapshot (read-only).
 *
 * Heuristics align with order-payment-reconcile.js + money-path style counts.
 * Does not call other scripts (avoids spawn/parsing drift).
 *
 * Usage:
 *   node scripts/daily-incident-summary.js
 *   node scripts/daily-incident-summary.js --limit 30 --recentDays 7
 */

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

const BUCKET_LABELS = {
  deposit_gt_total: {
    name: "Numeric: deposit > total",
    note: "Data entry or migration inconsistency",
  },
  amount_paid_gt_total: {
    name: "Numeric: amountPaid > totalAmount",
    note: "Verify totals and refunds",
  },
  full_amount_vs_status: {
    name: "Full pay vs PAID_IN_FULL",
    note: "Money recorded vs status ceiling",
  },
  deposit_threshold_vs_ledger: {
    name: "Deposit threshold vs ledger",
    note: "Deposit rule met vs depositPaidAt/status",
  },
  money_with_pre_payment_status: {
    name: "Money with pre-payment status",
    note: "Likely stale workflow",
  },
  payment_ref_pre_payment_status: {
    name: "Payment ref + pre-pay status",
    note: "Square payment id but quote-phase status",
  },
  payment_ref_without_invoice_ref: {
    name: "Payment ref without invoice ref",
    note: "Linkage gap — verify",
  },
  paid_tier_status_no_square_refs: {
    name: "Paid-tier status, no Square refs",
    note: "Possible linkage or migration gap",
  },
};

function parseArgs(argv) {
  const out = { limit: 40, recentDays: 7 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        if (key === "limit" || key === "recentDays") {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            out[key] = Math.min(Math.floor(n), key === "limit" ? 200 : 90);
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

/** Same keys as order-payment-reconcile.js classify (keep in sync manually). */
function classify(o) {
  if (o.status === "CANCELLED") return [];
  const reasons = [];
  const st = String(o.status || "");
  const paid = Number(o.amountPaid) || 0;
  const total = Number(o.totalAmount) || 0;
  const depStore = Number(o.depositAmount) || 0;

  if (depStore > total + EPS && total >= 0) {
    reasons.push("deposit_gt_total");
  }
  if (paid > total + EPS) {
    reasons.push("amount_paid_gt_total");
  }
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
  return [
    o.squareInvoiceId ? "inv" : "-",
    o.squareOrderId ? "ord" : "-",
    o.squarePaymentId ? "pay" : "-",
  ].join("/");
}

async function main() {
  const { limit, recentDays } = parseArgs(process.argv);
  const since = new Date(Date.now() - recentDays * 86400000);
  const base = { deletedAt: null };

  const [
    totalActive,
    countMissingRefs,
    countStalePaid,
  ] = await Promise.all([
    prisma.order.count({ where: base }),
    prisma.order.count({
      where: {
        ...base,
        status: { not: "CANCELLED" },
        squareInvoiceId: null,
        squareOrderId: null,
        squarePaymentId: null,
      },
    }),
    prisma.order.count({
      where: {
        ...base,
        amountPaid: { gt: EPS },
        status: { in: [...PRE_PAYMENT] },
        OR: [
          { squareInvoiceId: { not: null } },
          { squareOrderId: { not: null } },
          { squarePaymentId: { not: null } },
        ],
      },
    }),
  ]);

  const orders = await prisma.order.findMany({
    where: {
      ...base,
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
      squareLastEventId: true,
      updatedAt: true,
    },
  });

  const bucketTotals = {};
  const flagged = [];
  for (const o of orders) {
    const keys = classify(o);
    if (keys.length) {
      flagged.push({ order: o, keys });
      for (const k of keys) {
        bucketTotals[k] = (bucketTotals[k] || 0) + 1;
      }
    }
  }

  let ledgerDriftSample = 0;
  const withEvent = await prisma.order.findMany({
    where: { ...base, squareLastEventId: { not: null } },
    select: { id: true, squareLastEventId: true },
    take: 2500,
    orderBy: { updatedAt: "desc" },
  });
  const evIds = [
    ...new Set(withEvent.map((r) => r.squareLastEventId).filter(Boolean)),
  ];
  if (evIds.length) {
    const ok = await prisma.processedWebhookEvent.findMany({
      where: { id: { in: evIds } },
      select: { id: true },
    });
    const okSet = new Set(ok.map((r) => r.id));
    for (const row of withEvent) {
      const eid = row.squareLastEventId;
      if (eid && !okSet.has(eid)) {
        ledgerDriftSample += 1;
      }
    }
  }

  const topBuckets = Object.entries(bucketTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const reviewFirst = flagged.slice(0, 5);

  console.log("");
  console.log("=== CHEEKY OS DAILY INCIDENT SUMMARY ===");
  console.log("");
  console.log("1. Incident Snapshot");
  console.log(`- active orders (non-deleted): ${totalActive}`);
  console.log(
    `- likely missing Square refs (no inv/order/payment id, not cancelled): ${countMissingRefs}`
  );
  console.log(
    `- likely stale payment vs pre-pay status (amountPaid>0, has ref): ${countStalePaid}`
  );
  console.log(
    `- orders in bounded window with ≥1 reconcile signal: ${flagged.length} (last ${recentDays}d, max ${limit} rows by updatedAt)`
  );
  console.log(
    `- webhook ledger drift rows (sample up to 2500 with squareLastEventId): ${ledgerDriftSample} possible replay/idempotency review`
  );
  console.log(
    "- unavailable: live Square API history; full global sweep — use money-path-report / export for depth"
  );
  console.log("");

  console.log("2. Highest Priority Buckets (bounded scan)");
  if (topBuckets.length === 0) {
    console.log("- (none flagged in this window)");
  } else {
    for (const [key, c] of topBuckets) {
      const meta = BUCKET_LABELS[key] || { name: key, note: "review" };
      console.log(`- ${meta.name}: count=${c} — ${meta.note}`);
    }
  }
  console.log("");

  console.log("3. Records to Review First (up to 5)");
  if (reviewFirst.length === 0) {
    console.log("- (none in this scan slice)");
  } else {
    for (const { order: o, keys } of reviewFirst) {
      const label = o.orderNumber || o.id;
      console.log(`- ${label}  id=${o.id}`);
      console.log(`  status=${o.status}  refs ${refsLine(o)}`);
      console.log(`  signals: ${keys.join("|")}`);
    }
  }
  console.log("");

  console.log("4. Recommended Actions");
  console.log(
    "- Drill-down: node scripts/order-state-audit.js --orderId <uuid> (or orderNumber / Square ids)."
  );
  console.log(
    "- Webhook idempotency: node scripts/webhook-replay-inspect.js --eventId <id> (if you have event_id)."
  );
  console.log(
    "- Broader lists: node scripts/money-path-report.js · node scripts/order-payment-reconcile.js"
  );
  console.log(
    "- Repair only after audit confirms intent; many stale rows → verify canonical POST /api/square/webhook delivery."
  );
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
