"use strict";

const { getPrisma, runDecisionEngineInTransaction } = require("./decisionEngine");

const TYPES = {
  PREP_JOB: "PREP_JOB",
  ORDER_GARMENTS: "ORDER_GARMENTS",
  PRODUCTION_RUN: "PRODUCTION_RUN",
  COMPLETE_ORDER: "COMPLETE_ORDER",
};

/**
 * Create a task linked to an order (single-record write; caller may wrap in transaction).
 */
async function createTask({ orderId, title, type, assignedTo }) {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  const t = String(type || "").trim();
  if (!orderId || !title || !TYPES[t]) {
    return { success: false, error: "orderId, title, and valid type required", code: "VALIDATION_ERROR" };
  }
  try {
    const task = await prisma.task.create({
      data: {
        orderId: String(orderId),
        title: String(title).slice(0, 500),
        type: t,
        status: "PENDING",
        assignedTo: assignedTo ? String(assignedTo) : null,
      },
    });
    console.log("[taskService] task created", task.id, t);
    return { success: true, data: { task } };
  } catch (e) {
    console.error("[taskService.createTask]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "task_create_failed", code: "TASK_CREATE_FAILED" };
  }
}

// [CHEEKY-GATE] CHEEKY_createTaskWithDecision — extracted from POST /api/os/tasks.
// Pure relocation: $transaction task.create + runDecisionEngineInTransaction.
async function CHEEKY_createTaskWithDecision({ orderId, title, type, assignedTo }) {
  const t = String(type || "").trim();
  if (!orderId || !title || !TYPES[t]) {
    return { success: false, error: "orderId, title, and valid type required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const data = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        orderId: String(orderId),
        title: String(title).slice(0, 500),
        type: t,
        status: "PENDING",
        assignedTo: assignedTo ? String(assignedTo) : null,
      },
    });
    const order = await runDecisionEngineInTransaction(tx, String(orderId));
    return { task, order };
  });
  console.log("[taskService] task created", data.task.id, t);
  return { success: true, data };
}

module.exports = {
  TYPES,
  createTask,
  CHEEKY_createTaskWithDecision,
};
