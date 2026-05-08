#!/usr/bin/env node
/**
 * Cheeky OS — overnight read-only ops digest (bounded time window).
 *
 * Summarizes recent intake, money-path, production, and incident-style signals
 * using the same classify heuristics as daily-incident-summary / reconcile (manual sync).
 *
 * Usage:
 *   node scripts/overnight-ops-digest.js
 *   node scripts/overnight-ops-digest.js --hours 24
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

const PRODUCTIONISH = new Set([
  "PRODUCTION_READY",
  "DEPOSIT_PAID",
  "PAID_IN_FULL",
  "PRODUCTION",
  "PRINTING",
  "QC",
  "READY",
  "IN_PRODUCTION",
]);

function parseArgs(argv) {
  const out = { hours: 12 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === "hours" && next && !next.startsWith("--")) {
        const n = Number(next);
        if (Number.isFinite(n) && n > 0) {
          out.hours = Math.min(Math.floor(n), 168);
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

/** Aligns with order-payment-reconcile.js classify (keep in sync manually). */
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

function fmtOrder(o) {
  return o.orderNumber || o.id.slice(0, 8);
}

async function main() {
  const { hours } = parseArgs(process.argv);
  const since = new Date(Date.now() - hours * 3600000);
  const base = { deletedAt: null };

  const select = {
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
    createdAt: true,
    productionStatus: true,
    jobCreated: true,
    manualOverride: true,
    blockedReason: true,
  };

  const [
    newOrdersCount,
    intakeOpenCount,
    blockedCount,
    webhookLedgerCount,
    manualOverrideCount,
  ] = await Promise.all([
    prisma.order.count({
      where: { ...base, createdAt: { gte: since } },
    }),
    prisma.order.count({
      where: {
        ...base,
        updatedAt: { gte: since },
        status: "INTAKE",
      },
    }),
    prisma.order.count({
      where: {
        ...base,
        updatedAt: { gte: since },
        status: "BLOCKED",
      },
    }),
    prisma.processedWebhookEvent
      .count({
        where: { processedAt: { gte: since } },
      })
      .catch(() => null),
    prisma.order.count({
      where: {
        ...base,
        updatedAt: { gte: since },
        manualOverride: true,
      },
    }),
  ]);

  const ordersInWindow = await prisma.order.findMany({
    where: { ...base, updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select,
  });

  let jobTouches = null;
  try {
    jobTouches = await prisma.job.count({
      where: { updatedAt: { gte: since } },
    });
  } catch {
    jobTouches = null;
  }

  const flagged = [];
  let moneyTouch = 0;
  const statusTally = {};
  let productionish = 0;

  for (const o of ordersInWindow) {
    const reasons = classify(o);
    if (reasons.length) flagged.push({ o, reasons });

    const paid = Number(o.amountPaid) || 0;
    if (paid > EPS || hasAnySquareRef(o) || o.squareInvoiceNumber) {
      moneyTouch += 1;
    }

    const st = String(o.status || "");
    statusTally[st] = (statusTally[st] || 0) + 1;
    if (PRODUCTIONISH.has(st) || (o.productionStatus && String(o.productionStatus))) {
      productionish += 1;
    }
  }

  const intakeReviewCandidates = ordersInWindow.filter(
    (o) =>
      o.status === "INTAKE" ||
      o.status === "QUOTE_READY" ||
      o.status === "BLOCKED"
  );

  console.log("");
  console.log("=== CHEEKY OS OVERNIGHT OPS DIGEST ===");
  console.log("");
  console.log(
    `Window: last ${hours} hours (since ${since.toISOString()})`
  );
  console.log(
    `Scan: up to ${ordersInWindow.length} most recently updated orders in window (cap 500).`
  );
  console.log("");

  console.log("1. Intake activity");
  console.log(`   New orders created in window: ${newOrdersCount}`);
  console.log(
    `   Orders touched in window still INTAKE: ${intakeOpenCount} (status=INTAKE, updated in window)`
  );
  console.log(
    `   Candidate rows needing attention (INTAKE / QUOTE_READY / BLOCKED in scan): ${intakeReviewCandidates.length}`
  );
  if (intakeReviewCandidates.length > 0) {
    intakeReviewCandidates.slice(0, 5).forEach((o) => {
      console.log(
        `   - ${fmtOrder(o)}  ${o.status}${o.blockedReason ? ` (${String(o.blockedReason).slice(0, 60)})` : ""}`
      );
    });
  }
  console.log("");

  console.log("2. Money path activity");
  console.log(
    `   Orders in scan with money / Square refs activity: ${moneyTouch}`
  );
  console.log(
    `   Reconcile-style flags in scan (any reason): ${flagged.length}`
  );
  console.log(
    `   BLOCKED status updates in window (DB count): ${blockedCount}`
  );
  console.log("");

  console.log("3. Production movement");
  console.log(
    `   Orders in scan with production-ish status or productionStatus set: ${productionish}`
  );
  if (jobTouches !== null) {
    console.log(`   Job rows updated in window: ${jobTouches}`);
  } else {
    console.log(
      "   Job rows updated in window: unavailable (query failed — check Prisma client)"
    );
  }
  console.log("   Status mix (orders in scan):");
  Object.keys(statusTally)
    .sort((a, b) => statusTally[b] - statusTally[a])
    .slice(0, 12)
    .forEach((k) => {
      console.log(`   - ${k}: ${statusTally[k]}`);
    });
  console.log("");

  console.log("4. Incident flags");
  console.log(
    `   Square webhook ledger events processed in window: ${
      webhookLedgerCount === null
        ? "unavailable"
        : webhookLedgerCount
    } (ProcessedWebhookEvent.processedAt; not duplicate detection)`
  );
  console.log(`   Orders with manualOverride in window: ${manualOverrideCount}`);
  console.log(
    "   Replay/duplicate suspicion: not computed here — use webhook:inspect / ledger tools if needed."
  );
  console.log("");

  console.log("5. Recommended first actions");
  if (flagged.length > 0) {
    console.log("   - Run batch review on flagged pool:");
    console.log("     node scripts/operator.js batch --limit 15");
    flagged.slice(0, 5).forEach(({ o, reasons }) => {
      console.log(
        `   - Audit / review ${fmtOrder(o)} [${reasons.slice(0, 3).join(", ")}${reasons.length > 3 ? "…" : ""}]`
      );
      console.log(`     node scripts/order-state-audit.js --orderId ${o.id}`);
    });
  } else {
    console.log("   - No reconcile flags in the capped scan — spot-check money path if volume looked odd.");
  }
  if (newOrdersCount > 0) {
    console.log("   - Review new intakes from the window in your CRM / intake queue.");
  }
  if (blockedCount > 0) {
    console.log("   - Unblock or follow up on BLOCKED orders counted above.");
  }
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
