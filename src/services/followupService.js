"use strict";

const cron = require("node-cron");
const { getPrisma } = require("./decisionEngine");

let cronStarted = false;

function startFollowupCronIfEnabled() {
  if (cronStarted) return;
  // Low-energy mode: on-demand follow-up routes only.
  cronStarted = true;
  console.log("[SAFE MODE] Follow-up cron disabled; use API routes on-demand");
  console.log("[SAFE EXIT] Completed without background persistence");
}

async function findUnpaidOrders() {
  const { getEligibleOrders } = require("./followupRulesService");
  return getEligibleOrders();
}

async function buildFollowups() {
  const orders = await findUnpaidOrders();
  return orders.map((order) => ({
    orderId: order.id,
    customerName: order.customerName,
    type: "PAYMENT_REMINDER",
    message: `Follow up with ${order.customerName} for deposit`,
    priority: "HIGH",
  }));
}

/**
 * Prioritized next actions + v3.3 buckets: deposits needed, stuck jobs, pickups ready.
 */
async function getTopActions(limit = 25) {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const [rows, depositsNeeded, stuckJobs, pickupsReady] = await Promise.all([
      prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: [{ updatedAt: "asc" }],
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          nextAction: true,
          nextOwner: true,
          blockedReason: true,
          status: true,
          customerName: true,
          updatedAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [{ status: "AWAITING_DEPOSIT" }, { blockedReason: "WAITING_ON_DEPOSIT" }],
        },
        orderBy: [{ updatedAt: "asc" }],
        take: 40,
        select: {
          id: true,
          orderNumber: true,
          nextAction: true,
          nextOwner: true,
          customerName: true,
          status: true,
        },
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ["READY", "COMPLETED", "CANCELLED", "PAID_IN_FULL"] },
          updatedAt: { lt: new Date(Date.now() - 3 * 86400000) },
        },
        orderBy: [{ updatedAt: "asc" }],
        take: 30,
        select: {
          id: true,
          orderNumber: true,
          nextAction: true,
          nextOwner: true,
          customerName: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [{ qcComplete: true, nextOwner: "Cheeky" }, { status: "READY", nextOwner: "Cheeky" }],
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 25,
        select: {
          id: true,
          orderNumber: true,
          nextAction: true,
          nextOwner: true,
          customerName: true,
          status: true,
        },
      }),
    ]);
    const prioritized = rows
      .filter((r) => r.nextAction)
      .sort((a, b) => {
        const score = (x) => (x.blockedReason === "WAITING_ON_DEPOSIT" ? 0 : x.nextOwner === "Jeremy" ? 1 : 2);
        return score(a) - score(b);
      });
    return {
      success: true,
      data: {
        depositsNeeded,
        stuckJobs,
        pickupsReady,
        actions: prioritized,
      },
    };
  } catch (e) {
    console.error("[followupService.getTopActions]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "query_failed", code: "QUERY_FAILED" };
  }
}

/**
 * Orders that need human attention (blocked or deposit / art).
 */
async function getNeedsAttention(limit = 40) {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const rows = await prisma.order.findMany({
      where: {
        deletedAt: null,
        OR: [
          { blockedReason: { not: null } },
          { status: "AWAITING_DEPOSIT" },
          { status: "WAITING_ART" },
        ],
      },
      orderBy: [{ updatedAt: "asc" }],
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        nextAction: true,
        nextOwner: true,
        blockedReason: true,
        status: true,
        customerName: true,
      },
    });
    return { success: true, data: { orders: rows } };
  } catch (e) {
    console.error("[followupService.getNeedsAttention]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "query_failed", code: "QUERY_FAILED" };
  }
}

startFollowupCronIfEnabled();

module.exports = {
  buildFollowups,
  getTopActions,
  getNeedsAttention,
  startFollowupCronIfEnabled,
};
