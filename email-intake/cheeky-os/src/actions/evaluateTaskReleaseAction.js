"use strict";

const prisma = require("../prisma");
const orderReadinessEngine = require("../operator/orderReadinessEngine");
const actionAudit = require("../operator/actionAudit");

module.exports = async function evaluateTaskReleaseAction(taskId) {
  try {
    if (!taskId) {
      return { success: false, message: "Missing taskId" };
    }
    if (!prisma) {
      return { success: false, message: "Prisma unavailable" };
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return { success: false, message: "Task not found" };
    }

    let lead = null;
    try {
      if (task.leadId && prisma.lead && typeof prisma.lead.findUnique === "function") {
        lead = await prisma.lead.findUnique({
          where: { id: task.leadId },
        });
      }
    } catch (_) {}

    const readiness = orderReadinessEngine({
      depositRequired: lead ? lead.depositRequired : true,
      depositPaid: lead ? lead.depositPaid : false,
      paymentStatus: lead ? lead.paymentStatus : "UNPAID",
    });

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        orderReady: readiness.orderReady,
        productionHold: readiness.productionHold,
        releaseStatus: readiness.releaseStatus,
      },
    });

    actionAudit({
      type: "TASK_RELEASE_EVALUATED",
      taskId,
      leadId: lead ? lead.id : null,
      releaseStatus: readiness.releaseStatus,
      reason: readiness.reason,
    });

    return {
      success: true,
      task: updated,
      readiness,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
