"use strict";

/**
 * PHASE 3 — Order Metrics Service
 * Pulls live order counts from Prisma (wraps existing orderStatusEngine where possible).
 *
 * FAIL SAFE: Falls back to 0 counts if DB unavailable.
 * NO AUTO-SEND. READ ONLY.
 */

const path = require("path");

function getPrisma() {
  try { return require(path.join(__dirname, "..", "..", "src", "lib", "prisma")); } catch (_) { return null; }
}

function safePrismaCount(prisma, model, where) {
  try { return prisma[model].count({ where }); } catch (_) { return Promise.resolve(0); }
}

const PRODUCTION_STATUSES  = ["READY", "PRINTING", "QC", "PRODUCTION_READY"];
const CLOSED_STATUSES      = ["DONE", "COMPLETED", "CANCELLED", "CANCELED", "ARCHIVED", "LOST"];
const OPEN_EXCLUDE         = [...CLOSED_STATUSES];

/**
 * Returns live order counts for the snapshot.
 * @returns {Promise<{openOrders: number, ordersInProduction: number, overdueOrders: number, newOrdersLast24h: number}>}
 */
async function getMetrics() {
  const empty = { openOrders: 0, ordersInProduction: 0, overdueOrders: 0, newOrdersLast24h: 0 };

  try {
    const prisma = getPrisma();
    if (!prisma) {
      // Fallback: try existing orderStatusEngine
      try {
        const { getActiveProductionOrdersForAlerts } = require("./orderStatusEngine");
        const production = await getActiveProductionOrdersForAlerts();
        return {
          openOrders: production.length,
          ordersInProduction: production.length,
          overdueOrders: 0,
          newOrdersLast24h: 0,
        };
      } catch (_) {}
      return empty;
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [openOrders, ordersInProduction, overdueOrders, newOrdersLast24h] = await Promise.all([
      safePrismaCount(prisma, "order", {
        deletedAt: null,
        status: { notIn: OPEN_EXCLUDE },
      }),
      safePrismaCount(prisma, "order", {
        deletedAt: null,
        status: { in: PRODUCTION_STATUSES },
      }),
      safePrismaCount(prisma, "order", {
        deletedAt: null,
        status: { notIn: CLOSED_STATUSES },
        completedAt: { lt: now },
        NOT: { completedAt: null },
      }),
      safePrismaCount(prisma, "order", {
        deletedAt: null,
        createdAt: { gte: yesterday },
      }),
    ]);

    return { openOrders, ordersInProduction, overdueOrders, newOrdersLast24h };
  } catch (err) {
    console.warn("[order.metrics] error — returning zeros:", err && err.message ? err.message : err);
    return empty;
  }
}

module.exports = { getMetrics };
