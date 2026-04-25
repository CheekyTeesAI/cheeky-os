"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Gate target audited: PRODUCTION_READY -> PRINTING
// - Deposit verification source: Order.depositPaidAt via canEnterProduction()

const path = require("path");
const policyEngine = require("../operator/policyEngine");
const actionAudit = require("../operator/actionAudit");
const paymentGate = require("../operator/paymentGate");

function getPrismaClient() {
  try {
    const prisma = require("../prisma");
    if (prisma) return prisma;
  } catch (_) {}

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
    } catch (_) {}
  }

  return null;
}

module.exports = async function taskAdvanceAction(taskId) {
  try {
    let canEnterProduction = null;
    try {
      canEnterProduction = require(path.join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "src",
        "services",
        "depositGate"
      )).canEnterProduction;
    } catch (_) {}

    const policy = policyEngine({
      action: "ADVANCE_TASK",
      data: { taskId },
    });

    if (policy.blocked) {
      actionAudit({
        type: "ADVANCE_TASK_BLOCKED",
        taskId,
        reasons: policy.reasons,
      });

      return {
        success: false,
        blocked: true,
        reasons: policy.reasons,
      };
    }

    if (!taskId) {
      return { success: false, message: "Missing taskId" };
    }

    const prisma = getPrismaClient();
    if (!prisma) {
      return { success: false, message: "Prisma unavailable" };
    }

    let task = null;
    try {
      task = await prisma.task.findUnique({
        where: { id: taskId },
      });
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }

    if (!task) {
      return { success: false, message: "Task not found" };
    }

    let relatedLead = null;

    try {
      if (task.leadId && prisma && prisma.lead && typeof prisma.lead.findUnique === "function") {
        relatedLead = await prisma.lead.findUnique({
          where: { id: task.leadId },
        });
      }
    } catch (_) {}

    if (task.status === "PRODUCTION_READY" || task.status === "PRINTING") {
      const gate = paymentGate({
        depositRequired: relatedLead ? relatedLead.depositRequired : true,
        depositPaid: relatedLead ? relatedLead.depositPaid : false,
      });

      if (gate.blocked) {
        return {
          success: false,
          blocked: true,
          message: gate.reason,
        };
      }

      try {
        if (task.orderId && prisma && prisma.order && typeof prisma.order.findUnique === "function") {
          const relatedOrder = await prisma.order.findUnique({
            where: { id: task.orderId },
            select: { id: true, depositPaidAt: true },
          });
          const orderGatePass =
            typeof canEnterProduction === "function"
              ? canEnterProduction(relatedOrder)
              : !!(relatedOrder && relatedOrder.depositPaidAt);
          if (!orderGatePass) {
            console.log(
              `[BLOCKED] advance task | blocked | reason=Deposit required before production taskId=${taskId}`
            );
            return {
              success: false,
              blocked: true,
              message: "Deposit required before production",
            };
          }
        } else if (task.status === "PRODUCTION_READY" || task.status === "PRINTING") {
          // BLOCKED: task/order linkage missing for depositPaidAt verification | attempted fix: fail-closed for production move
          return {
            success: false,
            blocked: true,
            message: "Deposit verification unavailable for production",
          };
        }
      } catch (orderGateErr) {
        console.log(
          "[BLOCKED] advance task | blocked | order_gate_error=",
          orderGateErr && orderGateErr.message ? orderGateErr.message : String(orderGateErr)
        );
        return {
          success: false,
          blocked: true,
          message: "Deposit verification failed",
        };
      }
    }

    if (task.status === "PRODUCTION_READY") {
      if (task.orderReady !== true || task.releaseStatus !== "READY") {
        return {
          success: false,
          blocked: true,
          message: "Task is not released for production",
        };
      }
    }

    // SIMPLE STATUS FLOW
    let nextStatus = null;

    if (task.status === "PRODUCTION_READY") nextStatus = "PRINTING";
    else if (task.status === "PRINTING") nextStatus = "QC";
    else if (task.status === "QC") nextStatus = "COMPLETED";

    if (!nextStatus) {
      return { success: false, message: "No valid next status" };
    }

    let updated = null;
    try {
      updated = await prisma.task.update({
        where: { id: taskId },
        data: { status: nextStatus },
      });
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }

    actionAudit({
      type: "ADVANCE_TASK_SUCCESS",
      taskId,
      nextStatus,
    });

    return {
      success: true,
      message: `Task advanced to ${nextStatus}`,
      task: updated,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
