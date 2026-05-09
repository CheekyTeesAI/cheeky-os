/**
 * POST /api/tasks/:id/advance — one step forward in production (capture SQLite or PostgreSQL Order).
 */

const express = require("express");
const path = require("path");
const { getPrisma } = require("../marketing/prisma-client");
const {
  updateCaptureOrderStatus,
  normalizeStoredStatus,
} = require("../services/orderStatusEngine");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("../services/paymentGateService");
const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

const router = express.Router();

const CAPTURE_NEXT = {
  READY: "PRINTING",
  PRINTING: "QC",
  QC: "DONE",
};

const PRODUCTION_GATE_TARGETS = ["READY", "PRINTING", "QC"];

/** PostgreSQL Order — minimal forward chain aligned with dashboard labels. */
const PG_NEXT = {
  PRODUCTION_READY: "PRINTING",
  DEPOSIT_PAID: "PRINTING",
  PAID_IN_FULL: "PRINTING",
  PRINTING: "QC",
  QC: "COMPLETED",
};

let pgPrismaSingleton;
function getPgPrisma() {
  if (pgPrismaSingleton !== undefined) return pgPrismaSingleton;
  if (!process.env.DATABASE_URL) {
    pgPrismaSingleton = null;
    return null;
  }
  try {
    const { PrismaClient } = require(path.join(
      __dirname,
      "..",
      "..",
      "node_modules",
      "@prisma",
      "client"
    ));
    pgPrismaSingleton = new PrismaClient();
    return pgPrismaSingleton;
  } catch {
    pgPrismaSingleton = null;
    return null;
  }
}

/**
 * @param {string} id
 * @returns {Promise<{ order: object } | null>}
 */
async function findCaptureOrderContext(id) {
  try {
    const prisma = getPrisma();
    if (!prisma || !prisma.captureOrder) return null;

    const row = await prisma.captureOrder.findUnique({ where: { id } });
    if (row) return { order: row };

    if (!prisma.captureTask) return null;
    const task = await prisma.captureTask.findUnique({
      where: { id },
      include: { order: true },
    });
    if (task && task.order) return { order: task.order };
    return null;
  } catch {
    return null;
  }
}

/**
 * Advance a Prisma Task row (PENDING → IN_PROGRESS → COMPLETE).
 * @param {string} rawId - task id
 * @returns {Promise<{ success: boolean, taskId: string, previousStatus: string, newStatus: string } | { error: string } | null>}
 */
async function tryAdvancePrismaTask(rawId) {
  try {
    const prisma = getPgPrisma();
    if (!prisma || !prisma.task) return null;

    const id = String(rawId || "").trim();
    const task = await prisma.task.findUnique({
      where: { id },
    });
    if (!task) return null;

    const cur = String(task.status || "PENDING").toUpperCase();
    let next;
    if (cur === "PENDING") next = "IN_PROGRESS";
    else if (cur === "IN_PROGRESS") next = "COMPLETE";
    else if (cur === "COMPLETE" || cur === "DONE") {
      return { error: `task already ${cur}` };
    } else {
      next = "IN_PROGRESS";
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { status: next, updatedAt: new Date() },
    });

    if (next === "COMPLETE" && task.jobId) {
      const remaining = await prisma.task.count({
        where: {
          jobId: task.jobId,
          status: { notIn: ["DONE", "COMPLETE"] },
        },
      });
      if (remaining === 0) {
        await prisma.job.update({
          where: { id: task.jobId },
          data: { status: "QC", updatedAt: new Date() },
        });
      }
    }

    return {
      success: true,
      taskId: task.id,
      previousStatus: cur,
      newStatus: next,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} rawId
 * @returns {Promise<{ success: boolean, taskId: string, previousStatus: string, newStatus: string } | { error: string } | null>}
 */
async function tryAdvancePostgresOrder(rawId) {
  try {
    const prisma = getPgPrisma();
    if (!prisma) return null;

    const id = String(rawId || "").trim();
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
    });
    if (!order) return null;

    const cur = String(order.status);
    const next = PG_NEXT[cur];
    if (!next) {
      return { error: `cannot advance from status ${cur}` };
    }

    if (next === "PRINTING") {
      const paidEnough =
        Number(order.depositPaid || 0) >= Number(order.depositRequired || 0) ||
        Number(order.amountPaid || 0) >= Number(order.depositRequired || 0) ||
        order.depositReceived === true ||
        String(order.status || "").toUpperCase() === "PAID_IN_FULL";
      if (!paidEnough) {
        return { error: "Deposit not paid — cannot advance to PRINTING" };
      }
      const artSt = String(order.artFileStatus || "").toUpperCase();
      if (artSt !== "READY" && artSt !== "APPROVED") {
        return {
          error:
            "production_blocked: artwork must be READY or APPROVED before printing",
        };
      }
      if (order.proofRequired === true) {
        const ps = String(order.proofStatus || "").toUpperCase();
        if (ps !== "APPROVED") {
          return {
            error:
              "production_blocked: customer proof must be APPROVED before printing",
          };
        }
      }
    }

    if (next === "COMPLETED") {
      try {
        const qcGateTa = require(path.join(__dirname, "..", "services", "qcGate.service"));
        const qgt = await qcGateTa.assertMayCompleteOrder(order.id);
        if (!qgt.ok) {
          return { error: qgt.error || "qc_gate_blocked" };
        }
      } catch (e) {
        return { error: e instanceof Error ? e.message : "qc_gate_error" };
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: next },
    });

    if (next === "COMPLETED") {
      try {
        require(path.join(__dirname, "..", "services", "qcGate.service")).onOrderMarkedCompleted(order.id);
      } catch (_qcx) {
        /* optional */
      }
    }

    return {
      success: true,
      taskId: order.id,
      previousStatus: cur,
      newStatus: next,
    };
  } catch {
    return null;
  }
}

router.post("/:id/advance", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, error: "id required" });
    }

    const cap = await findCaptureOrderContext(id);
    if (cap && cap.order) {
      const row = cap.order;
      const previousStatus = normalizeStoredStatus(row.status);
      const nextStatus = CAPTURE_NEXT[previousStatus];
      if (!nextStatus) {
        return res.status(400).json({
          success: false,
          error: `cannot advance from status ${previousStatus}`,
        });
      }

      const nextNorm = String(nextStatus).trim().toUpperCase();
      if (PRODUCTION_GATE_TARGETS.includes(nextNorm)) {
        const prisma = getPrisma();
        if (!prisma || !prisma.captureOrder) {
          return res.status(503).json({
            success: false,
            error: "Database unavailable",
          });
        }
        const fresh = await prisma.captureOrder.findUnique({ where: { id: row.id } });
        if (!fresh) {
          return res.status(404).json({ success: false, error: "task not found" });
        }
        const gate = evaluatePaymentGate(captureOrderToGateInput(fresh));
        if (!gate.allowedToProduce && nextNorm === "PRINTING") {
          return res.status(400).json({
            success: false,
            error: "Deposit not paid — cannot advance to PRINTING",
          });
        }
      }

      const result = await updateCaptureOrderStatus(row.id, nextStatus);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || "advance_failed",
        });
      }
      const st = String(result.status || "").toUpperCase();
      if (st === "DONE") {
        try {
          memoryService.logEvent("task_completed", {
            taskId: row.id,
            newStatus: result.status,
            channel: "capture",
          });
        } catch (_) {
          /* optional */
        }
      }
      return res.json({
        success: true,
        taskId: row.id,
        previousStatus,
        newStatus: result.status,
        timestamp: new Date().toISOString(),
      });
    }

    const prismaTaskAdv = await tryAdvancePrismaTask(id);
    if (prismaTaskAdv) {
      if (prismaTaskAdv.error) {
        return res.status(400).json({ success: false, error: prismaTaskAdv.error });
      }
      const st = String(prismaTaskAdv.newStatus || "").toUpperCase();
      if (st === "DONE" || st === "COMPLETE") {
        try {
          memoryService.logEvent("task_completed", {
            taskId: prismaTaskAdv.taskId,
            newStatus: prismaTaskAdv.newStatus,
            channel: "prisma_task",
          });
        } catch (_) {
          /* optional */
        }
      }
      return res.json({
        success: true,
        taskId: prismaTaskAdv.taskId,
        previousStatus: prismaTaskAdv.previousStatus,
        newStatus: prismaTaskAdv.newStatus,
        scope: "prisma_task",
        timestamp: new Date().toISOString(),
      });
    }

    const pg = await tryAdvancePostgresOrder(id);
    if (pg) {
      if (pg.error) {
        if (String(pg.error).toLowerCase().includes("deposit")) {
          return res.status(400).json({
            success: false,
            error: "Deposit not paid — cannot advance to PRINTING",
          });
        }
        return res.status(400).json({ success: false, error: pg.error });
      }
      const st = String(pg.newStatus || "").toUpperCase();
      if (st === "DONE" || st === "COMPLETED") {
        try {
          memoryService.logEvent("task_completed", {
            taskId: pg.taskId,
            newStatus: pg.newStatus,
            channel: "postgres_order",
          });
        } catch (_) {
          /* optional */
        }
      }
      return res.json({
        success: true,
        taskId: pg.taskId,
        previousStatus: pg.previousStatus,
        newStatus: pg.newStatus,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(404).json({ success: false, error: "task not found" });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "advance_failed",
    });
  }
});

module.exports = router;
