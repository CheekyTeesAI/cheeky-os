"use strict";

const path = require("path");
const prisma = require("../prisma");

const policy = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "autopilotPolicy"
));

const state = {
  actionsTakenToday: 0,
  blockedActionsToday: 0,
  createdTasks: 0,
  advancedStatuses: 0,
  lastRunAt: null,
  audit: [],
};

function pushAudit(entry) {
  const row = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  state.audit.unshift(row);
  state.audit = state.audit.slice(0, 200);
}

function logPolicyBlocked(action, reason) {
  state.blockedActionsToday += 1;
  console.log(`[AUTOPILOT] BLOCKED BY POLICY | ${action} | ${reason}`);
  pushAudit({ type: "POLICY_BLOCK", action, reason });
}

function logExternalBlocked(action, reason) {
  state.blockedActionsToday += 1;
  console.log(
    `[AUTOPILOT] BLOCKED — EXTERNAL ACTION NOT ALLOWED IN CONTROLLED MODE | ${action} | ${reason}`
  );
  pushAudit({ type: "EXTERNAL_BLOCK", action, reason });
}

async function createInternalTaskForOrder(order, taskType, priority) {
  if (!policy.canCreateInternalTask()) {
    logPolicyBlocked("create_internal_task", "canCreateInternalTask=false");
    return { success: false, blocked: true };
  }
  if (!prisma) return { success: false, blocked: true, reason: "prisma_unavailable" };

  const job = await prisma.job.findFirst({
    where: { orderId: order.id },
    select: { id: true },
  });

  if (!job) {
    // BLOCKED: Task model requires jobId | attempted fix: auto-skip and log when order has no job link
    state.blockedActionsToday += 1;
    pushAudit({
      type: "TASK_CREATE_BLOCKED",
      orderId: order.id,
      taskType,
      reason: "missing_job_link",
    });
    return { success: false, blocked: true, reason: "missing_job_link" };
  }

  const existing = await prisma.task.findFirst({
    where: {
      orderId: order.id,
      type: taskType,
      status: { not: "COMPLETED" },
    },
    select: { id: true },
  });
  if (existing) {
    pushAudit({
      type: "TASK_DEDUPE_SKIP",
      orderId: order.id,
      taskType,
      taskId: existing.id,
    });
    return { success: true, deduped: true, taskId: existing.id };
  }

  const task = await prisma.task.create({
    data: {
      jobId: job.id,
      orderId: order.id,
      title: `${taskType}: ${order.customerName || order.id}`,
      type: taskType,
      status: "PRODUCTION_READY",
      assignedTo: "Patrick",
      notes: `AUTOPILOT CONTROLLED MODE | priority=${priority}`,
      releaseStatus: "BLOCKED",
      orderReady: false,
      blanksOrdered: false,
      productionHold: true,
    },
  });

  state.actionsTakenToday += 1;
  state.createdTasks += 1;
  pushAudit({
    type: "TASK_CREATED",
    orderId: order.id,
    taskType,
    priority,
    taskId: task.id,
  });
  return { success: true, taskId: task.id };
}

async function maybeAdvanceStatus(order, toStatus) {
  if (!policy.canAdvanceInternalStatus()) {
    logPolicyBlocked("advance_internal_status", "canAdvanceInternalStatus=false");
    return { success: false, blocked: true };
  }
  if (!prisma) return { success: false, blocked: true, reason: "prisma_unavailable" };

  const fromStatus = String(order.status || "");
  if (fromStatus === "PRINTING" || fromStatus === "QC" || fromStatus === "COMPLETED") {
    pushAudit({
      type: "STATUS_SKIP_ADVANCED",
      orderId: order.id,
      from: fromStatus,
      to: toStatus,
    });
    return { success: true, skipped: true };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: toStatus },
  });
  state.actionsTakenToday += 1;
  state.advancedStatuses += 1;
  console.log(`[AUTOPILOT] STATUS ADVANCED | ${order.id} | ${fromStatus} -> ${toStatus}`);
  pushAudit({
    type: "STATUS_ADVANCED",
    orderId: order.id,
    from: fromStatus,
    to: toStatus,
  });
  return { success: true };
}

async function runAutopilotControlledActions() {
  const now = Date.now();
  const cutoff = new Date(now - 24 * 60 * 60 * 1000);

  try {
    if (!policy.isControlledMode()) {
      logPolicyBlocked("run_controlled_actions", "not_controlled_mode");
      return { success: false, blocked: true };
    }
    if (!prisma) {
      pushAudit({ type: "RUN_FAIL", reason: "prisma_unavailable" });
      return { success: false, blocked: true };
    }

    if (!policy.canSendExternalMessage()) {
      logExternalBlocked("send_message", "policy_disallows_external_message");
    }
    if (!policy.canPlaceVendorOrder()) {
      logExternalBlocked("place_vendor_order", "policy_disallows_vendor_order");
    }
    if (!policy.canTouchSquare()) {
      logExternalBlocked("touch_square", "policy_disallows_square_touch");
    }

    const quoteFollowUps = await prisma.order.findMany({
      where: {
        status: "QUOTE_SENT",
        depositPaidAt: null,
        createdAt: { lt: cutoff },
      },
      select: { id: true, status: true, customerName: true, createdAt: true },
      take: 25,
    });

    for (const order of quoteFollowUps) {
      await createInternalTaskForOrder(order, "DEPOSIT_FOLLOWUP_REVIEW", "HIGH");
      if (String(order.status) === "QUOTE_SENT") {
        await maybeAdvanceStatus(order, "ATTENTION_REQUIRED");
      }
    }

    const readyForOrderReview = await prisma.order.findMany({
      where: {
        status: "DEPOSIT_PAID",
        depositPaidAt: { not: null },
        garmentsOrdered: false,
      },
      select: { id: true, status: true, customerName: true, createdAt: true },
      take: 25,
    });

    for (const order of readyForOrderReview) {
      await createInternalTaskForOrder(order, "GARMENT_ORDER_REVIEW", "HIGH");
      if (String(order.status) === "DEPOSIT_PAID") {
        await maybeAdvanceStatus(order, "READY_FOR_ORDER_REVIEW");
      }
    }

    const stuckBeforePrint = await prisma.order.findMany({
      where: {
        status: "PRODUCTION_READY",
        updatedAt: { lt: cutoff },
      },
      select: { id: true, status: true, customerName: true, updatedAt: true },
      take: 25,
    });

    for (const order of stuckBeforePrint) {
      await createInternalTaskForOrder(order, "PRODUCTION_REVIEW", "MEDIUM");
    }

    state.lastRunAt = new Date().toISOString();
    pushAudit({
      type: "RUN_OK",
      followUps: quoteFollowUps.length,
      readyForOrder: readyForOrderReview.length,
      stuckBeforePrint: stuckBeforePrint.length,
      at: state.lastRunAt,
    });

    return {
      success: true,
      followUps: quoteFollowUps.length,
      readyForOrder: readyForOrderReview.length,
      stuckBeforePrint: stuckBeforePrint.length,
    };
  } catch (err) {
    state.blockedActionsToday += 1;
    state.lastRunAt = new Date().toISOString();
    pushAudit({
      type: "RUN_FAIL",
      reason: err && err.message ? err.message : String(err),
      at: state.lastRunAt,
    });
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function getAutopilotStatus() {
  return {
    mode: String(process.env.AUTOPILOT_MODE || "unknown"),
    enabled: String(process.env.AUTOPILOT || "false").toLowerCase() === "true",
    actionsTakenToday: state.actionsTakenToday,
    blockedActionsToday: state.blockedActionsToday,
    createdTasks: state.createdTasks,
    advancedStatuses: state.advancedStatuses,
    lastRunAt: state.lastRunAt,
    timestamp: new Date().toISOString(),
  };
}

function getAutopilotAudit() {
  return {
    success: true,
    note: "In-memory controlled autopilot audit buffer",
    actions: state.audit.slice(0, 100),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  runAutopilotControlledActions,
  getAutopilotStatus,
  getAutopilotAudit,
};
