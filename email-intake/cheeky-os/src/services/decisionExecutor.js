"use strict";

const prisma = require("../prisma");
const evaluateTaskReleaseAction = require("../actions/evaluateTaskReleaseAction");
const createVendorOrderDraftAction = require("../actions/createVendorOrderDraftAction");
const { canAutoDecide, canExecuteInternalAction, getDecisionMode } = require("./decisionPolicy");
const { logDecision } = require("./decisionAudit");

async function executeDecision(decision) {
  const mode = getDecisionMode();
  const base = { ...decision };
  if (mode !== "controlled_internal_actions") {
    return { ...base, outcome: "recommended", executedAction: null };
  }
  const action = String(base.recommendedAction || "");
  if (!canAutoDecide(action) || !canExecuteInternalAction(action)) {
    const blocked = {
      ...base,
      outcome: "blocked",
      blockedReason: "policy_disallowed_execution",
    };
    await logDecision(blocked);
    return blocked;
  }

  try {
    if (!prisma) {
      const blocked = { ...base, outcome: "blocked", blockedReason: "prisma_unavailable" };
      await logDecision(blocked);
      return blocked;
    }

    if (action === "evaluate_release" && base.entityType === "task") {
      const result = await evaluateTaskReleaseAction(base.entityId);
      if (result && result.success) {
        const executed = { ...base, outcome: "executed", executedAction: "evaluate_release", data: { ...(base.data || {}), result } };
        await logDecision(executed);
        return executed;
      }
      const blocked = { ...base, outcome: "blocked", blockedReason: (result && (result.message || result.error)) || "evaluate_release_failed" };
      await logDecision(blocked);
      return blocked;
    }

    if (action === "create_vendor_draft_if_already_approved_by_existing_policy" && base.entityType === "task") {
      const result = await createVendorOrderDraftAction(base.entityId);
      if (result && result.success) {
        const executed = { ...base, outcome: "executed", executedAction: "create_vendor_draft", data: { ...(base.data || {}), result } };
        await logDecision(executed);
        return executed;
      }
      const blocked = { ...base, outcome: "blocked", blockedReason: (result && (result.message || result.error)) || "vendor_draft_failed" };
      await logDecision(blocked);
      return blocked;
    }

    if (action === "create_internal_task" && base.entityType === "order") {
      const job = await prisma.job.findFirst({ where: { orderId: base.entityId }, select: { id: true } });
      if (!job || !job.id) {
        const blocked = { ...base, outcome: "blocked", blockedReason: "missing_job_link" };
        await logDecision(blocked);
        return blocked;
      }
      const task = await prisma.task.create({
        data: {
          jobId: job.id,
          orderId: base.entityId,
          title: `DECISION: ${base.decisionType}`,
          type: "DECISION_INTERNAL_TASK",
          status: "INTAKE",
          assignedTo: "Patrick",
          notes: base.reason || "Decision engine recommendation",
        },
      });
      const executed = { ...base, outcome: "executed", executedAction: "create_internal_task", data: { ...(base.data || {}), taskId: task.id } };
      await logDecision(executed);
      return executed;
    }

    if (action === "advance_to_safe_review_state" && base.entityType === "order") {
      const order = await prisma.order.findUnique({ where: { id: base.entityId }, select: { status: true, depositPaidAt: true } });
      if (!order) {
        const blocked = { ...base, outcome: "blocked", blockedReason: "order_not_found" };
        await logDecision(blocked);
        return blocked;
      }
      if (!order.depositPaidAt && (order.status === "PRODUCTION_READY" || order.status === "PRINTING")) {
        const blocked = { ...base, outcome: "blocked", blockedReason: "deposit_gate_block" };
        await logDecision(blocked);
        return blocked;
      }
      if (order.status === "QUOTE_SENT") {
        await prisma.order.update({ where: { id: base.entityId }, data: { status: "ATTENTION_REQUIRED" } });
      } else if (order.status === "DEPOSIT_PAID") {
        await prisma.order.update({ where: { id: base.entityId }, data: { status: "READY_FOR_ORDER_REVIEW" } });
      }
      const executed = { ...base, outcome: "executed", executedAction: "advance_to_safe_review_state" };
      await logDecision(executed);
      return executed;
    }

    const skipped = { ...base, outcome: "skipped", blockedReason: "unsupported_safe_action_path" };
    await logDecision(skipped);
    return skipped;
  } catch (err) {
    const blocked = { ...base, outcome: "blocked", blockedReason: err && err.message ? err.message : String(err) };
    await logDecision(blocked);
    return blocked;
  }
}

async function executeDecisions(decisions) {
  const out = [];
  for (const d of decisions || []) {
    // isolate failures per decision
    // eslint-disable-next-line no-await-in-loop
    const result = await executeDecision(d);
    out.push(result);
  }
  return out;
}

module.exports = {
  executeDecision,
  executeDecisions,
};
