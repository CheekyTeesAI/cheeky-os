"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Scheduler target: 15-minute snapshot loop (safe, read-only)
// - Cash-protection telemetry: quote/deposit/production states

const prisma = require("../prisma");
const DAY_MS = 24 * 60 * 60 * 1000;
let latestInsights = {
  followUpsNeeded: [],
  readyForGarments: [],
  stuckOrders: [],
  printingQueueCount: 0,
  timestamp: new Date().toISOString(),
};

function getLatestAgentInsights() {
  return latestInsights;
}

function blockSafeModeAction(actionName, details) {
  console.log(
    `[AGENT] BLOCKED — ACTION NOT ALLOWED IN SAFE MODE | action=${actionName || "unknown"} | details=${details || ""}`
  );
  return { blocked: true };
}

async function runAgentLoop(options = {}) {
  try {
    if (!prisma) {
      console.warn("[AGENT_LOOP] SNAPSHOT | degraded | prisma_unavailable");
      latestInsights = {
        followUpsNeeded: [],
        readyForGarments: [],
        stuckOrders: [],
        printingQueueCount: 0,
        timestamp: new Date().toISOString(),
      };
      return {
        success: false,
        snapshot: {
          quoteSentNoDeposit: 0,
          depositPaid: 0,
          productionActive: 0,
          timestamp: new Date().toISOString(),
          degraded: "prisma_unavailable",
        },
      };
    }

    const cutoff = new Date(Date.now() - DAY_MS);

    const followUpRows = await prisma.order.findMany({
      where: {
        status: "QUOTE_SENT",
        depositPaidAt: null,
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: "asc" },
      take: 25,
      select: {
        id: true,
        customerName: true,
        createdAt: true,
      },
    });
    followUpRows.forEach((row) => {
      const ageHours = Math.floor((Date.now() - new Date(row.createdAt).getTime()) / (60 * 60 * 1000));
      console.log(
        `[AGENT] FOLLOW-UP NEEDED | ${row.id} | age=${ageHours}h | customer=${row.customerName || "Unknown"}`
      );
    });

    const readyForGarmentsRows = await prisma.order.findMany({
      where: {
        status: "DEPOSIT_PAID",
        garmentsOrdered: false,
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        customerName: true,
        updatedAt: true,
      },
    });
    readyForGarmentsRows.forEach((row) => {
      console.log(`[AGENT] READY FOR GARMENTS | ${row.id}`);
    });

    const stuckRows = await prisma.order.findMany({
      where: {
        status: "PRODUCTION_READY",
        updatedAt: { lt: cutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: 25,
      select: {
        id: true,
        updatedAt: true,
      },
    });
    stuckRows.forEach((row) => {
      const ageHours = Math.floor((Date.now() - new Date(row.updatedAt).getTime()) / (60 * 60 * 1000));
      console.log(`[AGENT] STUCK BEFORE PRINT | ${row.id} | age=${ageHours}h`);
    });

    const printingQueueCount = await prisma.order.count({
      where: { status: "PRINTING" },
    });
    if (printingQueueCount > 5) {
      console.log(`[AGENT] QUEUE PRESSURE | printing count high | count=${printingQueueCount}`);
    }

    const quoteSentNoDeposit = await prisma.order.count({
      where: {
        status: "QUOTE_SENT",
        depositPaidAt: null,
      },
    });
    const depositPaid = await prisma.order.count({
      where: {
        depositPaidAt: { not: null },
      },
    });
    const productionActive = await prisma.order.count({
      where: {
        status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
      },
    });
    const depositsPending = await prisma.order.count({
      where: {
        depositPaidAt: null,
      },
    });

    latestInsights = {
      followUpsNeeded: followUpRows.map((row) => ({
        id: row.id,
        customerName: row.customerName,
        createdAt: row.createdAt,
      })),
      readyForGarments: readyForGarmentsRows.map((row) => ({
        id: row.id,
        customerName: row.customerName,
        updatedAt: row.updatedAt,
      })),
      stuckOrders: stuckRows.map((row) => ({
        id: row.id,
        updatedAt: row.updatedAt,
      })),
      printingQueueCount,
      timestamp: new Date().toISOString(),
    };

    const snapshot = {
      quoteSentNoDeposit,
      depositPaid,
      productionActive,
      depositsPending,
      readyToOrder: readyForGarmentsRows.length,
      inProduction: printingQueueCount,
      followUpsNeeded: followUpRows.length,
      stuckOrders: stuckRows.length,
      timestamp: new Date().toISOString(),
    };

    if (options && options.executeActions === true) {
      blockSafeModeAction("executeActions", "runAgentLoop requested side effects");
    }

    console.log(
      `[AGENT_LOOP] SNAPSHOT | ok | quoteNoDeposit=${quoteSentNoDeposit} depositPaid=${depositPaid} productionActive=${productionActive} followUpsNeeded=${followUpRows.length} readyToOrder=${readyForGarmentsRows.length} stuckOrders=${stuckRows.length} printingQueue=${printingQueueCount}`
    );
    return { success: true, snapshot };
  } catch (err) {
    console.error(
      "[AGENT_LOOP] SNAPSHOT | fail |",
      err && err.message ? err.message : String(err)
    );
    return {
      success: false,
      snapshot: {
        quoteSentNoDeposit: 0,
        depositPaid: 0,
        productionActive: 0,
        timestamp: new Date().toISOString(),
        degraded: "agent_loop_error",
      },
    };
  }
}

module.exports = {
  runAgentLoop,
  getLatestAgentInsights,
  blockSafeModeAction,
};
