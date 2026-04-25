"use strict";

const path = require("path");
const prismaDirect = require("../prisma");
const buildPriorities = require("./priorityEngine");
const salesEngine = require("./salesEngine");
const moneyEngine = require("./moneyEngine");

function getPrismaClient() {
  try {
    const prisma = require("../prisma");
    if (prisma) return prisma;
  } catch (_) {
    // fallback below
  }

  const candidates = [
    path.join(__dirname, "..", "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "..", "services", "decisionEngine"),
  ];
  for (const candidate of candidates) {
    try {
      const decisionEngine = require(candidate);
      if (decisionEngine && typeof decisionEngine.getPrisma === "function") {
        const prisma = decisionEngine.getPrisma();
        if (prisma) return prisma;
      }
    } catch (_) {
      // continue trying next candidate
    }
  }

  return null;
}

module.exports = async function getSummary() {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return {
        success: false,
        error: "Prisma client unavailable",
        timestamp: new Date().toISOString(),
        metrics: {},
        alerts: [],
        queues: {},
      };
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {},
      alerts: [],
      queues: {},
    };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // ORDERS TODAY
    try {
      const ordersToday = await prisma.order.count({
        where: { createdAt: { gte: startOfDay } },
      });
      summary.metrics.ordersToday = ordersToday;
    } catch (_) {}

    // OPEN TASKS
    try {
      const openTasks = await prisma.task.count({
        where: { status: { not: "COMPLETED" } },
      });
      summary.metrics.openTasks = openTasks;
    } catch (_) {}

    // PRINTING QUEUE
    try {
      const printingQueue = await prisma.task.findMany({
        where: { status: "PRINTING" },
        take: 10,
      });
      summary.queues.printing = printingQueue;
    } catch (_) {}

    // PRODUCTION READY
    try {
      const productionReady = await prisma.task.findMany({
        where: { status: "PRODUCTION_READY" },
        take: 10,
      });
      summary.queues.productionReady = productionReady;
    } catch (_) {}

    // OVERDUE ALERTS
    try {
      const overdueTasks = await prisma.task.count({
        where: {
          status: { not: "COMPLETED" },
          dueDate: { lt: new Date() },
        },
      });

      if (overdueTasks > 0) {
        summary.alerts.push({
          type: "OVERDUE_TASKS",
          count: overdueTasks,
          message: `${overdueTasks} tasks overdue`,
        });
      }
    } catch (_) {}

    try {
      summary.priorities = buildPriorities(summary);
    } catch (_) {
      summary.priorities = [];
    }

    try {
      summary.sales = await salesEngine();
    } catch (_) {
      summary.sales = {};
    }

    try {
      summary.money = moneyEngine(summary);
    } catch (_) {
      summary.money = {};
    }

    try {
      const prisma = prismaDirect || getPrismaClient();
      if (prisma) {
        summary.pipeline = {
          leads: await prisma.lead.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
        };
      } else {
        summary.pipeline = {};
      }
    } catch (_) {
      summary.pipeline = {};
    }

    try {
      const prisma = prismaDirect || getPrismaClient();
      if (prisma) {
        summary.release = {
          blockedTasks: await prisma.task.count({
            where: { releaseStatus: "BLOCKED" },
          }),
          readyTasks: await prisma.task.count({
            where: { releaseStatus: "READY" },
          }),
          orderedTasks: await prisma.task.count({
            where: { blanksOrdered: true },
          }),
        };
      } else {
        summary.release = {};
      }
    } catch (_) {
      summary.release = {};
    }

    try {
      const prisma = prismaDirect || getPrismaClient();
      let vendorDraftCount = 0;
      try {
        if (prisma && prisma.vendorOrderDraft && typeof prisma.vendorOrderDraft.count === "function") {
          vendorDraftCount = await prisma.vendorOrderDraft.count({
            where: { status: "DRAFT" },
          });
        }
      } catch (_) {}

      summary.vendorDrafts = {
        draftCount: vendorDraftCount,
      };
    } catch (_) {
      summary.vendorDrafts = {};
    }

    return summary;
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
