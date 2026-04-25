"use strict";

const prisma = require("../prisma");
const actionAudit = require("../operator/actionAudit");

module.exports = async function markBlanksOrderedAction(taskId) {
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

    if (task.orderReady !== true) {
      actionAudit({
        type: "BLANKS_ORDER_BLOCKED",
        taskId,
        reason: "Task not order ready",
      });

      return {
        success: false,
        blocked: true,
        message: "Task is not cleared for blanks ordering",
      };
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        blanksOrdered: true,
      },
    });

    actionAudit({
      type: "BLANKS_ORDERED_MARKED",
      taskId,
    });

    return {
      success: true,
      task: updated,
      message: "Blanks marked ordered",
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
