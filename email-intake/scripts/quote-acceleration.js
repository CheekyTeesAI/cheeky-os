#!/usr/bin/env node
/**
 * Cheeky OS — Quote refresh + reorder acceleration (read-only ranked report).
 *
 * Uses src/lib/quoteRefreshScoring.ts. Does not edit quotes or send mail.
 *
 * Usage:
 *   node scripts/quote-acceleration.js
 *   node scripts/quote-acceleration.js --perType 20 --orderScanLimit 8000
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const {
  scoreOrderAcceleration,
  scoreEasyReorderAcceleration,
  rankAccelerationCandidates,
  groupAccelerationByType,
} = require(path.join(__dirname, "..", "src", "lib", "quoteRefreshScoring.ts"));

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EPS = 1e-6;
const QUOTE_LANE = new Set([
  "QUOTE_READY",
  "QUOTE_SENT",
  "APPROVED",
  "INVOICE_DRAFTED",
]);

function parseArgs(argv) {
  const out = { orderScanLimit: null, perType: 18 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (
        (key === "orderScanLimit" || key === "perType") &&
        next &&
        !next.startsWith("--")
      ) {
        const n = Number(next);
        if (Number.isFinite(n) && n > 0) {
          if (key === "orderScanLimit") out.orderScanLimit = Math.min(Math.floor(n), 50000);
          else out.perType = Math.min(Math.floor(n), 200);
        }
        i++;
      }
    }
  }
  return out;
}

function ageDays(date) {
  return (Date.now() - date.getTime()) / 86400000;
}

function orderValue(o) {
  const ta = Number(o.totalAmount) || 0;
  const tot = o.total != null ? Number(o.total) || 0 : 0;
  const q = o.quotedAmount != null && o.quotedAmount > 0 ? Number(o.quotedAmount) : 0;
  return Math.max(ta, tot, q);
}

function outstanding(o) {
  return Math.max(0, orderValue(o) - (Number(o.amountPaid) || 0));
}

function computeGapDays(orderRows) {
  if (orderRows.length < 2) return null;
  const sorted = [...orderRows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  let ms = 0;
  for (let i = 1; i < sorted.length; i++) {
    ms += sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime();
  }
  return ms / (sorted.length - 1) / 86400000;
}

function hasOpenQuoteLaneOrder(orderRows) {
  return orderRows.some((o) => {
    const st = String(o.status || "").toUpperCase();
    return QUOTE_LANE.has(st) && outstanding(o) > EPS;
  });
}

function buildHistory(customerId, byCustomer, fallbackOrder) {
  if (!customerId) {
    return {
      historicalOrderCount: 1,
      estimatedHistoricalSpend: Number(fallbackOrder.amountPaid) || 0,
      daysSinceLastOrder: ageDays(fallbackOrder.updatedAt),
      avgOrderGapDays: null,
    };
  }
  const rows = byCustomer.get(customerId) || [];
  if (rows.length === 0) {
    return {
      historicalOrderCount: 0,
      estimatedHistoricalSpend: 0,
      daysSinceLastOrder: null,
      avgOrderGapDays: null,
    };
  }
  let paid = 0;
  let lastUpd = rows[0].updatedAt;
  for (const r of rows) {
    paid += Number(r.amountPaid) || 0;
    if (r.updatedAt > lastUpd) lastUpd = r.updatedAt;
  }
  const sortedByUpd = [...rows].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return {
    historicalOrderCount: rows.length,
    estimatedHistoricalSpend: paid,
    daysSinceLastOrder: ageDays(sortedByUpd[0].updatedAt),
    avgOrderGapDays: computeGapDays(rows),
  };
}

function printSection(title, list, cap) {
  console.log(`--- ${title} (${list.length}) ---`);
  if (list.length === 0) {
    console.log("  (none)");
    console.log("");
    return;
  }
  list.slice(0, cap).forEach((c, i) => {
    const who = c.customerName || c.customerEmail || c.sourceRef.slice(0, 8);
    console.log(
      `  ${i + 1}. [${c.type}] score=${c.priorityScore} | ${who} | review=${c.reviewRequired}`
    );
    console.log(`     ${c.reason}`);
    console.log(`     → ${c.suggestedAction} | reorder≈${c.reorderLikelihood}`);
    if (c.scoreFactors.length) {
      console.log(`     factors: ${c.scoreFactors.slice(0, 5).join(" | ")}`);
    }
    console.log("");
  });
  if (list.length > cap) {
    console.log(`  … +${list.length - cap} more not printed`);
    console.log("");
  }
}

async function main() {
  const { orderScanLimit, perType } = parseArgs(process.argv);

  const q = {
    where: { deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      status: true,
      updatedAt: true,
      createdAt: true,
      amountPaid: true,
      totalAmount: true,
      total: true,
      quotedAmount: true,
      squareInvoiceId: true,
      squareInvoiceNumber: true,
      blockedReason: true,
      manualOverride: true,
      email: true,
      customerName: true,
      phone: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
  };
  if (orderScanLimit != null) {
    q.take = orderScanLimit;
    q.orderBy = { updatedAt: "desc" };
  }

  const orders = await prisma.order.findMany(q);

  const byCustomer = new Map();
  for (const o of orders) {
    if (!o.customerId) continue;
    if (!byCustomer.has(o.customerId)) byCustomer.set(o.customerId, []);
    byCustomer.get(o.customerId).push(o);
  }

  const fromOrders = [];
  for (const o of orders) {
    const email = o.email || o.customer?.email || null;
    const name = o.customerName || o.customer?.name || null;
    const phone = o.phone || o.customer?.phone || null;
    const hist = buildHistory(o.customerId, byCustomer, o);
    const acc = scoreOrderAcceleration(
      {
        orderId: o.id,
        orderNumber: o.orderNumber,
        status: String(o.status),
        updatedAt: o.updatedAt,
        amountPaid: Number(o.amountPaid) || 0,
        totalAmount: Number(o.totalAmount) || 0,
        total: o.total,
        quotedAmount: o.quotedAmount,
        squareInvoiceId: o.squareInvoiceId,
        squareInvoiceNumber: o.squareInvoiceNumber,
        blockedReason: o.blockedReason,
        manualOverride: o.manualOverride === true,
        customerId: o.customerId,
        email,
        customerName: name,
        phone,
      },
      hist
    );
    if (acc) fromOrders.push(acc);
  }

  const easyReorder = [];
  for (const [customerId, rows] of byCustomer.entries()) {
    const cust = rows[0].customer;
    const name = cust?.name || rows[0].customerName || "?";
    const email = cust?.email || rows[0].email || null;
    const phone = cust?.phone || rows[0].phone || null;
    let paid = 0;
    for (const r of rows) paid += Number(r.amountPaid) || 0;
    const sorted = [...rows].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const daysSince = ageDays(sorted[0].updatedAt);
    const gap = computeGapDays(rows);
    const er = scoreEasyReorderAcceleration({
      customerId,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      orderCount: rows.length,
      lifetimePaid: paid,
      daysSinceLastOrder: daysSince,
      avgOrderGapDays: gap,
      hasOpenQuoteLaneOrder: hasOpenQuoteLaneOrder(rows),
    });
    if (er) easyReorder.push(er);
  }

  const merged = rankAccelerationCandidates([...fromOrders, ...easyReorder]);
  const grouped = groupAccelerationByType(merged);

  console.log("");
  console.log("=== CHEEKY OS — QUOTE REFRESH + REORDER ACCELERATION (read-only) ===");
  console.log("");
  if (orderScanLimit != null) {
    console.log(
      `WARNING: --orderScanLimit=${orderScanLimit} may skew aggregates — prefer full scan when possible.`
    );
    console.log("");
  }
  console.log(
    `Orders scanned: ${orders.length}. Order-derived targets: ${fromOrders.length}. Easy-reorder rows: ${easyReorder.length}.`
  );
  console.log("No quote edits or sends from this script.");
  console.log("");

  printSection("STALE QUOTE REFRESH", grouped.STALE_QUOTE_REFRESH, perType);
  printSection("EASY REORDER", grouped.EASY_REORDER, perType);
  printSection("LOW FRICTION FOLLOW-UP", grouped.LOW_FRICTION_FOLLOWUP, perType);
  printSection("REVIEW REQUIRED", grouped.REVIEW_REQUIRED, perType);

  console.log("--- Summary ---");
  console.log(`  Total acceleration rows: ${merged.length}`);
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
