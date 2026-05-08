#!/usr/bin/env node
/**
 * Cheeky OS — money-path operator report (read-only).
 *
 * Summarizes likely payment/order alignment issues from DB truth using heuristics.
 * Counts may overlap across buckets (same order can match multiple signals).
 *
 * Usage:
 *   node scripts/money-path-report.js
 *   node scripts/money-path-report.js --limit 15 --recentDays 14
 *
 * Env: DATABASE_URL (via email-intake/.env or environment).
 */

const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EPS = 1e-6;

const PRE_PAYMENT_STATUSES = ["INTAKE", "QUOTE_READY", "APPROVED", "INVOICE_DRAFTED"];

function parseArgs(argv) {
  const out = { limit: 20, recentDays: 7 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        if (key === "limit" || key === "recentDays") {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            out[key] = Math.min(Math.floor(n), key === "limit" ? 200 : 365);
          }
        } else {
          out[key] = next;
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

function depositReq(o) {
  if (o.depositRequired != null && Number.isFinite(o.depositRequired)) {
    return o.depositRequired;
  }
  const q = o.quotedAmount;
  if (q != null && q > 0) return q * 0.5;
  return 0;
}

function whyMissingRefs(o) {
  return "missing Square invoice/order/payment ids (webhooks may not match)";
}

function whyStalePaid(o) {
  return "amountPaid > 0 but status still looks pre-payment (likely stale vs Square)";
}

function whyFullPaidMismatch(o) {
  return "amountPaid meets/exceeds quotedAmount but status is not PAID_IN_FULL";
}

function whyDepositMismatch(o) {
  return "deposit threshold likely met but status/depositPaidAt do not look aligned";
}

function whyRecentSuspicious(o) {
  return "recently updated and matches a suspicious money-path signal";
}

function whyLedgerDrift(o) {
  return "squareLastEventId set but no matching ProcessedWebhookEvent row (possible drift)";
}

function label(o) {
  return o.orderNumber ? `${o.orderNumber} (${o.id})` : o.id;
}

function refsLine(o) {
  const inv = o.squareInvoiceId ? "inv" : "-";
  const ord = o.squareOrderId ? "ord" : "-";
  const pay = o.squarePaymentId ? "pay" : "-";
  return `inv=${inv} ord=${ord} pay=${pay}`;
}

async function loadLedgerIds(ids) {
  if (!ids.length) return new Set();
  const rows = await prisma.processedWebhookEvent.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

async function main() {
  const { limit, recentDays } = parseArgs(process.argv);
  const recentCutoff = new Date(Date.now() - recentDays * 86400000);

  const base = { deletedAt: null };

  const totalOrders = await prisma.order.count({ where: base });

  const missingSquareRefsWhere = {
    ...base,
    status: { not: "CANCELLED" },
    squareInvoiceId: null,
    squareOrderId: null,
    squarePaymentId: null,
  };

  const countMissingRefs = await prisma.order.count({
    where: missingSquareRefsWhere,
  });

  const stalePaidWhere = {
    ...base,
    amountPaid: { gt: EPS },
    status: { in: PRE_PAYMENT_STATUSES },
    OR: [
      { squareInvoiceId: { not: null } },
      { squareOrderId: { not: null } },
      { squarePaymentId: { not: null } },
    ],
  };

  const countStalePaid = await prisma.order.count({ where: stalePaidWhere });

  const quotedCandidates = await prisma.order.findMany({
    where: {
      ...base,
      quotedAmount: { not: null, gt: 0 },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      quotedAmount: true,
      amountPaid: true,
      squareInvoiceId: true,
      squareOrderId: true,
      squarePaymentId: true,
      depositRequired: true,
      depositPaidAt: true,
      updatedAt: true,
      createdAt: true,
      squareLastEventId: true,
    },
    take: 15000,
    orderBy: { updatedAt: "desc" },
  });

  let countFullPaidMismatch = 0;
  let countDepositMismatch = 0;
  const fullPaidRows = [];
  const depositRows = [];

  for (const o of quotedCandidates) {
    const q = o.quotedAmount;
    const paid = Number(o.amountPaid) || 0;
    const st = String(o.status || "");

    if (
      q != null &&
      q > 0 &&
      paid + EPS >= q &&
      st !== "PAID_IN_FULL" &&
      st !== "CANCELLED"
    ) {
      countFullPaidMismatch += 1;
      fullPaidRows.push(o);
    }

    const dep = depositReq(o);
    if (
      dep > 0 &&
      paid + EPS >= dep &&
      !o.depositPaidAt &&
      !["DEPOSIT_PAID", "PAID_IN_FULL", "CANCELLED"].includes(st)
    ) {
      countDepositMismatch += 1;
      depositRows.push(o);
    }
  }

  if (quotedCandidates.length >= 15000) {
    console.warn(
      "[money-path-report] note: quotedAmount>0 sample capped at 15000 (newest by updatedAt); full/deposit heuristic counts may be incomplete."
    );
  }

  const withEvent = await prisma.order.findMany({
    where: { ...base, squareLastEventId: { not: null } },
    select: { id: true, squareLastEventId: true },
    take: 8000,
    orderBy: { updatedAt: "desc" },
  });

  const eventIds = [
    ...new Set(withEvent.map((r) => r.squareLastEventId).filter(Boolean)),
  ];
  const ledgerOk = await loadLedgerIds(eventIds);
  let countLedgerDrift = 0;
  const driftOrderMeta = new Map();
  for (const row of withEvent) {
    const eid = row.squareLastEventId;
    if (eid && !ledgerOk.has(eid)) {
      countLedgerDrift += 1;
      driftOrderMeta.set(row.id, eid);
    }
  }

  if (withEvent.length >= 8000) {
    console.warn(
      "[money-path-report] note: squareLastEventId sample capped at 8000 rows; ledger drift count may be incomplete."
    );
  }

  const recentSuspicious = [];
  const recentCandidates = await prisma.order.findMany({
    where: {
      ...base,
      updatedAt: { gte: recentCutoff },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      quotedAmount: true,
      amountPaid: true,
      squareInvoiceId: true,
      squareOrderId: true,
      squarePaymentId: true,
      depositRequired: true,
      depositPaidAt: true,
      updatedAt: true,
      createdAt: true,
      squareLastEventId: true,
    },
    take: 12000,
    orderBy: { updatedAt: "desc" },
  });

  if (recentCandidates.length >= 12000) {
    console.warn(
      "[money-path-report] note: recent window candidate list capped at 12000 rows."
    );
  }

  const recentLedgerIds = [
    ...new Set(
      recentCandidates.map((r) => r.squareLastEventId).filter(Boolean)
    ),
  ];
  const recentLedger = await loadLedgerIds(recentLedgerIds);

  for (const o of recentCandidates) {
    let hit = false;
    if (
      o.status !== "CANCELLED" &&
      !o.squareInvoiceId &&
      !o.squareOrderId &&
      !o.squarePaymentId
    ) {
      hit = true;
    }
    const paid = Number(o.amountPaid) || 0;
    const st = String(o.status || "");
    if (paid > EPS && PRE_PAYMENT_STATUSES.includes(st) && hasAnySquareRef(o)) {
      hit = true;
    }
    const q = o.quotedAmount;
    if (
      q != null &&
      q > 0 &&
      paid + EPS >= q &&
      st !== "PAID_IN_FULL" &&
      st !== "CANCELLED"
    ) {
      hit = true;
    }
    const dep = depositReq(o);
    if (
      dep > 0 &&
      paid + EPS >= dep &&
      !o.depositPaidAt &&
      !["DEPOSIT_PAID", "PAID_IN_FULL", "CANCELLED"].includes(st)
    ) {
      hit = true;
    }
    const eid = o.squareLastEventId;
    if (eid && !recentLedger.has(eid)) {
      hit = true;
    }
    if (hit) {
      recentSuspicious.push(o);
    }
  }

  async function sample(where, existingRows) {
    if (existingRows && existingRows.length) {
      return existingRows.slice(0, limit);
    }
    return prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        quotedAmount: true,
        amountPaid: true,
        squareInvoiceId: true,
        squareOrderId: true,
        squarePaymentId: true,
        depositPaidAt: true,
        updatedAt: true,
        squareLastEventId: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  const samplesMissing = await sample(missingSquareRefsWhere);
  const samplesStale = await sample(stalePaidWhere);
  const samplesFull = fullPaidRows.slice(0, limit);
  const samplesDep = depositRows.slice(0, limit);

  const driftSampleIds = [...driftOrderMeta.keys()].slice(0, limit);
  const samplesDrift =
    driftSampleIds.length === 0
      ? []
      : await prisma.order.findMany({
          where: { id: { in: driftSampleIds } },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            quotedAmount: true,
            amountPaid: true,
            squareInvoiceId: true,
            squareOrderId: true,
            squarePaymentId: true,
            depositPaidAt: true,
            updatedAt: true,
            squareLastEventId: true,
          },
        });

  const samplesRecent = recentSuspicious.slice(0, limit);

  console.log("");
  console.log("=== CHEEKY OS MONEY PATH REPORT ===");
  console.log("");
  console.log(`Filters: sample limit=${limit} per bucket, recent window=${recentDays} days (updatedAt)`);
  console.log("");

  const largestBucket = Math.max(
    countMissingRefs,
    countStalePaid,
    countFullPaidMismatch,
    countDepositMismatch,
    countLedgerDrift
  );

  console.log("1. Summary");
  console.log(`- total orders scanned (non-deleted): ${totalOrders}`);
  console.log(
    "- total likely needing review: bucket counts overlap the same order; compare bucket lines (no single deduped total here)"
  );
  console.log(
    `- largest single-bucket count (heuristic ceiling, not distinct orders): ${largestBucket}`
  );
  console.log(`- missing Square refs (no inv/order/payment id, not cancelled): ${countMissingRefs}`);
  console.log(`- likely paid vs stale status (amountPaid>0, pre-pay status, has a ref): ${countStalePaid}`);
  console.log(`- likely full-pay mismatch (amountPaid>=quoted, status not PAID_IN_FULL): ${countFullPaidMismatch}`);
  console.log(`- likely deposit-alignment review (deposit rule, not aligned): ${countDepositMismatch}`);
  console.log(`- likely webhook ledger drift (last event id not in ledger, sampled): ${countLedgerDrift}`);
  console.log(`- recent suspicious (updated in last ${recentDays}d, any signal): ${recentSuspicious.length}`);
  console.log("");
  console.log("   Heuristic notice: numbers are signals, not proof. Buckets can overlap.");
  console.log("");

  console.log("2. Review buckets");
  console.log("- Missing invoice/payment references: orders with no squareInvoiceId, squareOrderId, or squarePaymentId.");
  console.log("- Has Square refs but status looks stale: money recorded (amountPaid) but status still pre-payment.");
  console.log("- Partial / deposit mismatch signals: deposit threshold likely met vs status / depositPaidAt.");
  console.log("- Quoted paid-in-full mismatch: amountPaid >= quotedAmount but status not PAID_IN_FULL.");
  console.log("- Webhook ledger drift (sampled): squareLastEventId not found in ProcessedWebhookEvent.");
  console.log(`- Recent orders with suspicious payment state: updated within ${recentDays} days and matched a signal.`);
  console.log("");

  function printBucket(title, rows, whyFn) {
    console.log(`3. Sample records — ${title} (up to ${limit})`);
    if (!rows.length) {
      console.log("  (none in sample)");
      console.log("");
      return;
    }
    for (const o of rows) {
      const why = whyFn(o);
      console.log(`  - ${label(o)}`);
      console.log(`    status=${o.status} amountPaid=${o.amountPaid} quoted=${o.quotedAmount ?? "(n/a)"} ${refsLine(o)}`);
      console.log(`    why: ${why}`);
    }
    console.log("");
  }

  printBucket("missing Square references", samplesMissing, whyMissingRefs);
  printBucket("stale vs paid (has refs)", samplesStale, whyStalePaid);
  printBucket("quoted vs paid-in-full status", samplesFull, whyFullPaidMismatch);
  printBucket("deposit alignment", samplesDep, whyDepositMismatch);
  printBucket("webhook ledger drift", samplesDrift, whyLedgerDrift);
  printBucket(`recent (${recentDays}d) suspicious`, samplesRecent, whyRecentSuspicious);

  console.log("4. Suggested next actions");
  console.log("- Run a focused check: node scripts/order-state-audit.js --orderId <uuid> (or orderNumber / Square ids).");
  console.log("- Use any manual repair only after audit confirms the intended target state.");
  console.log("- If many stale or drift rows appear, verify Square webhook delivery and idempotency (ProcessedWebhookEvent) in logs.");
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
