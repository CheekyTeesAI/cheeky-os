"use strict";

const crypto = require("crypto");

const policies = require("./executionPolicies");

const agentRunner = require("../agent/agentRunner");
const taskQueue = require("../agent/taskQueue");
const approvalEngine = require("../workflow/approvalEngine");
const { createTask } = require("../agent/taskSchema");

function correlationId() {
  try {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;
  } catch (_e) {
    return `corr-${Date.now()}`;
  }
}

/**
 * Enqueue + optional ledger row — does NOT bypass approvals for gated intents.
 * @param {{ intent:string, target:string, requirements:string[], priority?: string, actor?: string, requestedBy?: string }} spec
 */
function enqueueOperatorTask(spec) {
  try {
    const s = spec && typeof spec === "object" ? spec : {};
    const taskObj = createTask({
      intent: s.intent,
      target: s.target,
      requirements: Array.isArray(s.requirements) ? s.requirements : ["jarvis.enqueue"],
      priority: s.priority || "normal",
      status: "pending",
      requestedBy: String(s.actor || s.requestedBy || "jarvis-console").slice(0, 120),
      approvalRequired: true,
    });
    const eq = taskQueue.enqueueTask(taskObj);
    try {
      const tl = require("../diagnostics/executionTimeline");
      tl.appendTimelineEvent({ phase: "enqueue", taskId: taskObj.taskId, intent: taskObj.intent });
    } catch (_tl) {}

    try {
      if (eq.ok) {
        approvalEngine.ensurePendingRequestForTask(taskObj, taskObj.requestedBy, {});
      }
    } catch (_apr) {}

    return { ok: eq.ok, error: eq.error || null, task: eq.task || taskObj };
  } catch (e) {
    return { ok: false, error: e.message || String(e), task: null };
  }
}

/**
 * Runs an already-approved task from queue snapshot (belt uses agentRunner.verify again).
 */
async function executeApprovedQueuedTask(taskId, actorHint) {
  const cid = correlationId();
  try {
    const id = String(taskId || "").trim();
    if (!id) return { ok: false, error: "missing_task_id", correlationId: cid };

    const t = taskQueue.getTaskById(id);
    if (!t) return { ok: false, error: "task_not_found", correlationId: cid };
    if (String(t.status) !== "approved") return { ok: false, error: "task_not_approved", correlationId: cid };

    const cap = policies.classifyExecutionCapabilityFromTask(t);
    const pol = policies.policyForCapability(cap === "blocked" ? "blocked" : cap);
    if (pol === policies.BLOCKED) {
      return { ok: false, error: "policy_blocked_capability", correlationId: cid };
    }
    if (pol === policies.READ_ONLY) {
      return { ok: false, error: "execution_not_needed_read_only_capability", correlationId: cid };
    }

    let gate = { allowed: false, reason: "pre_check" };
    try {
      const runObj = Object.assign({}, t, { executionCorrelationId: cid });
      gate = approvalEngine.verifyExecutionAllowed(runObj);
      if (!gate || !gate.allowed) {
        try {
          const it = require("../diagnostics/incidentTracker");
          it.recordIncident({
            type: "execution_gate_denied",
            severity: "warning",
            taskId: id,
            detail: gate.reason || "blocked",
            actor: String(actorHint || "jarvis").slice(0, 120),
          });
        } catch (_it) {}
        return {
          ok: false,
          error: gate.reason || "approval_workflow_blocked",
          correlationId: cid,
        };
      }
    } catch (_ge) {
      return { ok: false, error: "approval_verify_threw_fail_closed", correlationId: cid };
    }

    const runPack = Object.assign({}, t, { executionCorrelationId: cid });

    try {
      taskQueue.updateTaskStatus(id, "running", {
        runningStartedAt: new Date().toISOString(),
      });
    } catch (_us0) {}

    const outcome = await agentRunner.runTask(runPack);

    try {
      if (outcome && (outcome.success === true || outcome.ok === true)) {
        taskQueue.markCompleted(id, outcome);
      } else {
        const err =
          outcome && outcome.error ? String(outcome.error) : "execution_failed";
        taskQueue.markFailed(id, err);
        try {
          const it = require("../diagnostics/incidentTracker");
          it.recordIncident({
            type: "task_execution_failed",
            severity: "high",
            taskId: id,
            detail: String(err || "").slice(0, 500),
          });
        } catch (_it2) {}
      }
    } catch (_mf) {}

    try {
      const oce = require("../memory/operationalContinuityEngine");
      oce.recordExecutionResult({ taskId: id, ok: !!(outcome && (outcome.success || outcome.ok)), correlationId: cid });
    } catch (_oc) {}

    try {
      const tl = require("../diagnostics/executionTimeline");
      tl.appendTimelineEvent({
        phase: "execution",
        taskId: id,
        note: outcome && outcome.error ? String(outcome.error) : "completed",
        correlationId: cid,
      });
    } catch (_tl2) {}

    return { ok: true, outcome, correlationId: cid };
  } catch (e) {
    return { ok: false, error: e.message || String(e), correlationId: cid };
  }
}

/**
 * High-level execute path: validate policy, optionally enqueue only.
 * @param {{ taskSpec: object, mode: 'enqueue'|'run', actor?: string }} req
 */
async function orchestrateExecution(req) {
  try {
    const r = req && typeof req === "object" ? req : {};
    const mode = String(r.mode || "enqueue").toLowerCase();
    const spec = r.taskSpec && typeof r.taskSpec === "object" ? r.taskSpec : {};
    const actor = String(r.actor || "operator").slice(0, 160);

    const cap = policies.classifyExecutionCapabilityFromTask(spec);
    const pol = policies.policyForCapability(cap === "blocked" ? "blocked" : cap);

    if (pol === policies.BLOCKED) {
      return { ok: false, error: "blocked_by_policy", policy: pol, capability: cap };
    }

    if (pol === policies.READ_ONLY) {
      return { ok: false, error: "read_only_no_execution", policy: pol, capability: cap };
    }

    if (mode === "enqueue" || mode === "queue") {
      const enq = enqueueOperatorTask(
        Object.assign({}, spec, {
          actor,
        })
      );
      try {
        const tl = require("../diagnostics/executionTimeline");
        tl.appendTimelineEvent({ phase: "recommend_enqueue", capability: cap, ok: enq.ok });
      } catch (_tl) {}
      return { ok: !!enq.ok, phase: "enqueued", enqueue: enq, policy: pol, capability: cap };
    }

    if (mode === "run") {
      const tid = String(spec.taskId || "").trim();
      if (!tid) return { ok: false, error: "missing_task_id_for_run" };
      try {
        const tl = require("../diagnostics/executionTimeline");
        tl.appendTimelineEvent({ phase: "pre_run_attempt", taskId: tid, actor });
      } catch (_tl3) {}
      const exec = await executeApprovedQueuedTask(tid, actor);
      return Object.assign({ phase: "executed", capability: cap, policy: pol }, exec);
    }

    return { ok: false, error: "unsupported_mode", policy: pol, capability: cap };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  enqueueOperatorTask,
  executeApprovedQueuedTask,
  orchestrateExecution,
};
