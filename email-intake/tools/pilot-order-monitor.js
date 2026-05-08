"use strict";

/**
 * Pilot order monitor — DB-backed snapshot for CHEEKY_PILOT_MODE operations.
 * Run from email-intake: node tools/pilot-order-monitor.js
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function startOfLocalDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function paidTodayWhere(start) {
  return {
    deletedAt: null,
    OR: [{ depositPaidAt: { gte: start } }, { finalPaidAt: { gte: start } }],
  };
}

function isDepositSatisfied(o) {
  if (o.depositStatus === "PAID") return true;
  if (o.depositPaid === true) return true;
  if (String(o.status || "").toUpperCase().includes("DEPOSIT_PAID")) return true;
  const req = Number(o.depositRequired || o.depositAmount || 0);
  const paid = Number(o.amountPaid || 0);
  const half = Number(o.totalAmount || o.quotedAmount || o.total || 0) * 0.5;
  if (req > 0 && paid + 1e-6 >= req) return true;
  if (half > 0 && paid + 1e-6 >= half) return true;
  return false;
}

function hasRouting(o) {
  const pf = String(o.productionTypeFinal || "").trim();
  const jt = o.job && String(o.job.productionType || "").trim();
  return Boolean(pf || jt);
}

async function duplicateInvoiceCount(prisma) {
  const rows = await prisma.order.findMany({
    where: { deletedAt: null, squareInvoiceId: { not: null } },
    select: { squareInvoiceId: true },
  });
  const m = new Map();
  for (const r of rows) {
    const k = String(r.squareInvoiceId);
    m.set(k, (m.get(k) || 0) + 1);
  }
  let extra = 0;
  for (const c of m.values()) {
    if (c > 1) extra += c - 1;
  }
  return extra;
}

async function main() {
  const prismaMod = require(path.join(__dirname, "..", "src", "lib", "prisma.js"));
  const prisma = prismaMod && typeof prismaMod === "object" ? prismaMod : null;

  if (!prisma || typeof prisma.order === "undefined") {
    console.log(
      JSON.stringify(
        {
          newPaidOrdersToday: 0,
          ordersNeedingAttention: [],
          duplicatesDetected: 0,
          unroutedOrders: 0,
          failedWebhookEvents: 0,
          error: "prisma_unavailable",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const start = startOfLocalDay();

  const newPaidOrdersToday = await prisma.order.count({
    where: paidTodayWhere(start),
  });

  const dupExtras = await duplicateInvoiceCount(prisma);

  const paidForRouting = await prisma.order.findMany({
    where: {
      deletedAt: null,
      OR: [{ depositStatus: "PAID" }, { depositPaid: true }, { status: "DEPOSIT_PAID" }],
    },
    select: {
      id: true,
      customerName: true,
      status: true,
      depositStatus: true,
      productionTypeFinal: true,
      squareInvoiceId: true,
      job: { select: { productionType: true } },
    },
  });

  let unroutedOrders = 0;
  const unroutedSample = [];
  for (const o of paidForRouting) {
    if (!hasRouting(o)) {
      unroutedOrders++;
      if (unroutedSample.length < 15) {
        unroutedSample.push({
          id: o.id,
          customerName: o.customerName,
          status: o.status,
          reason: "deposit_paid_no_production_type",
        });
      }
    }
  }

  const attention = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["AWAITING_DEPOSIT", "BLOCKED", "INTAKE"] },
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
    select: { id: true, customerName: true, status: true, amountPaid: true, depositStatus: true },
  });

  const ordersNeedingAttention = [];
  const seenIds = new Set();
  function pushAttention(row) {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);
    ordersNeedingAttention.push(row);
  }
  for (const o of attention) {
    if (!isDepositSatisfied(o)) {
      pushAttention({
        id: o.id,
        customerName: o.customerName,
        status: o.status,
        reason: "awaiting_deposit_or_intake",
      });
    }
  }
  for (const u of unroutedSample) {
    if (ordersNeedingAttention.length < 25) pushAttention(u);
  }

  let failedWebhookEvents = 0;
  try {
    failedWebhookEvents = await prisma.exceptionReview.count({
      where: {
        resolved: false,
        createdAt: { gte: start },
        OR: [
          { source: { contains: "webhook", mode: "insensitive" } },
          { message: { contains: "square-webhook", mode: "insensitive" } },
          { type: { contains: "SQUARE", mode: "insensitive" } },
        ],
      },
    });
  } catch (_) {
    failedWebhookEvents = 0;
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        newPaidOrdersToday,
        ordersNeedingAttention,
        duplicatesDetected: dupExtras,
        unroutedOrders,
        failedWebhookEvents,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.log(
    JSON.stringify(
      {
        newPaidOrdersToday: 0,
        ordersNeedingAttention: [],
        duplicatesDetected: 0,
        unroutedOrders: 0,
        failedWebhookEvents: 0,
        error: e && e.message ? e.message : String(e),
      },
      null,
      2
    )
  );
  process.exit(1);
});
