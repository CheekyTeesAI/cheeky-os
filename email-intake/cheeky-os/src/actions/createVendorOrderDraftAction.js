"use strict";

const prisma = require("../prisma");
const vendorOrderBuilder = require("../operator/vendorOrderBuilder");
const actionAudit = require("../operator/actionAudit");

module.exports = async function createVendorOrderDraftAction(taskId) {
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

    if (task.releaseStatus !== "READY" || task.orderReady !== true) {
      actionAudit({
        type: "VENDOR_DRAFT_BLOCKED",
        taskId,
        reason: "Task not released",
      });

      return {
        success: false,
        blocked: true,
        message: "Task is not cleared for vendor draft creation",
      };
    }

    let lead = null;
    try {
      if (task.leadId && prisma.lead && typeof prisma.lead.findUnique === "function") {
        lead = await prisma.lead.findUnique({
          where: { id: task.leadId },
        });
      }
    } catch (_) {}

    const payload = vendorOrderBuilder({
      vendorName: "Carolina Made",
      customerName: lead ? lead.name : task.title,
      quantity: lead ? lead.quantity : 0,
      garment: lead && lead.message ? lead.message : "Garment TBD",
      color: "TBD",
      sizes: {},
      notes: task.notes || "",
    });

    let savedDraft = null;
    try {
      if (prisma.vendorOrderDraft && typeof prisma.vendorOrderDraft.create === "function") {
        savedDraft = await prisma.vendorOrderDraft.create({
          data: {
            taskId: task.id,
            leadId: lead ? lead.id : null,
            vendorName: payload.vendorName,
            customerName: payload.customerName,
            status: "DRAFT",
            payloadJson: payload,
          },
        });
      }
    } catch (_) {}

    actionAudit({
      type: "VENDOR_DRAFT_CREATED",
      taskId,
      leadId: lead ? lead.id : null,
      vendorName: payload.vendorName,
      totalQty: payload.totalQty,
    });

    return {
      success: true,
      message: "Vendor order draft created",
      taskId: task.id,
      draft: savedDraft || payload,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
