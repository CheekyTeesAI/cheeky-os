"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma } = require("../services/decisionEngine");
const { logError } = require("../middleware/logger");

/** GET /api/reports/os/daily — revenue at risk, stuck orders, top 3 actions. */
router.get("/daily", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }
    const [atRiskAgg, atRiskCount, stuck, actions] = await Promise.all([
      prisma.order.aggregate({
        where: {
          deletedAt: null,
          depositReceived: false,
          quotedAmount: { gt: 0 },
        },
        _sum: { quotedAmount: true },
      }),
      prisma.order.count({
        where: {
          deletedAt: null,
          depositReceived: false,
          quotedAmount: { gt: 0 },
        },
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ["READY", "COMPLETED", "CANCELLED", "PAID_IN_FULL"] },
          updatedAt: { lt: new Date(Date.now() - 3 * 86400000) },
        },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          nextAction: true,
          nextOwner: true,
          updatedAt: true,
          quotedAmount: true,
        },
      }),
      prisma.order.findMany({
        where: { deletedAt: null, nextAction: { not: null } },
        select: { nextAction: true },
      }),
    ]);
    const actionCounts = {};
    for (const row of actions) {
      const k = row.nextAction || "";
      actionCounts[k] = (actionCounts[k] || 0) + 1;
    }
    const top3 = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([action, count]) => ({ action, count }));
    return res.status(200).json({
      success: true,
      data: {
        revenueAtRisk: {
          estimatedTotal: atRiskAgg._sum.quotedAmount || 0,
          orderCount: atRiskCount,
        },
        stuckOrders: stuck,
        topActions: top3,
      },
    });
  } catch (err) {
    logError("GET /api/reports/os/daily", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
