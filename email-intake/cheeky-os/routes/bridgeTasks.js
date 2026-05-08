"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const crypto = require("crypto");

const router = express.Router();

const { createTask } = require("../agent/taskSchema");
const taskQueue = require("../agent/taskQueue");
const agentRunner = require("../agent/agentRunner");
const safety = require("../agent/safetyGuard");

const EVENTS_FILE = path.join(taskQueue.DATA_DIR, "events.jsonl");

function actorFrom(req, fallback) {
  try {
    const h = req.headers && req.headers["x-actor"];
    if (h) return String(h);
    if (req.body && req.body.actor) return String(req.body.actor);
    return String(fallback || "http");
  } catch (_e) {
    return String(fallback || "http");
  }
}

function ok(data) {
  return { success: true, data };
}

function logEvent(eventType, route, taskId, success) {
  try {
    taskQueue.ensureDirAndFiles();
    const row = {
      eventType,
      route,
      taskId: taskId || null,
      timestamp: new Date().toISOString(),
      success: Boolean(success),
    };
    fs.appendFileSync(EVENTS_FILE, `${JSON.stringify(row)}\n`, "utf8");
  } catch (_e) {}
}

function outcomeSuccess(outcome) {
  try {
    if (!outcome || typeof outcome !== "object") return false;
    if (typeof outcome.success === "boolean") return outcome.success;
    if (typeof outcome.ok === "boolean") return outcome.ok;
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Assumes caller verified task is runnable (approved snapshot).
 */
async function executeManualRunner(req, res, id, routePath, t) {
  let correlationId = "";
  try {
    correlationId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;
  } catch (_cid) {
    correlationId = `corr-${Date.now()}`;
  }

  try {
    const cool = require("../services/taskFailCooldown");
    const cd = cool.isCoolingDown(id);
    if (cd.cooling) {
      safety.auditLog({
        eventType: "task_failed",
        taskId: id,
        actor: actorFrom(req, "http_run"),
        correlationId,
        metadata: { reason: "task_fail_cooldown", retryAfterMs: cd.retryAfterMs, routePath },
      });
      return res.status(429).json({
        success: false,
        error: "task_fail_cooldown",
        retryAfterMs: cd.retryAfterMs,
      });
    }
  } catch (_cool) {}

  try {
    const ae = require("../workflow/approvalEngine");
    const gate = ae.verifyExecutionAllowed(t);
    if (!gate.allowed) {
      safety.auditLog({
        eventType: "task_failed",
        taskId: id,
        actor: actorFrom(req, "http_run"),
        correlationId,
        metadata: { reason: "approval_workflow_gate", detail: gate.reason, routePath },
      });
      logEvent("task_run_requested", routePath, id, false);
      return res.status(403).json({
        success: false,
        error: "approval_workflow_required",
        reason: gate.reason || "blocked",
      });
    }
  } catch (_ge) {
    safety.auditLog({
      eventType: "task_failed",
      taskId: id,
      actor: actorFrom(req, "http_run"),
      correlationId,
      metadata: { reason: "approval_verify_engine_error_fail_closed", routePath },
    });
    logEvent("task_run_requested", routePath, id, false);
    return res.status(503).json({ success: false, error: "approval_verify_unavailable" });
  }

  const rl = safety.rateLimitCheck();
  if (!rl.allowed) {
    const body429 = safety.standardizedRateLimitHttpBody(rl);
    safety.auditLog({
      eventType: "rate_limit_hit",
      taskId: id,
      actor: actorFrom(req, "http_run"),
      correlationId,
      metadata: body429,
    });
    logEvent("task_run_requested", routePath, id, false);
    return res.status(429).json(body429);
  }

  logEvent("task_run_requested", routePath, id, true);

  safety.auditLog({
    eventType: "task_started",
    taskId: id,
    actor: actorFrom(req, "http_run"),
    correlationId,
    metadata: { manual: true, routePath },
  });

  taskQueue.updateTaskStatus(id, "running", {
    runningStartedAt: new Date().toISOString(),
  });

  let outcome;
  try {
    outcome = await agentRunner.runTask(Object.assign({}, t, { executionCorrelationId: correlationId }));
  } catch (runErr) {
    outcome = {
      success: false,
      ok: false,
      error: runErr && runErr.message ? runErr.message : String(runErr),
    };
  }

  try {
    safety.recordExecution(id);
  } catch (_rec) {}

  if (outcomeSuccess(outcome)) {
    taskQueue.markCompleted(id, outcome);
    safety.auditLog({
      eventType: "task_completed",
      taskId: id,
      actor: actorFrom(req, "http_run"),
      correlationId,
      metadata: { manual: true, routePath },
    });
    logEvent("task_completed", routePath, id, true);
    const fresh = taskQueue.getTaskById(id);
    try {
      const tm = require("../memory/taskMemory");
      tm.recordTerminalTask(fresh, "completed", outcome);
    } catch (_tm) {}
    return res.status(200).json(ok({ outcome, task: fresh }));
  }

  const errBlob =
    outcome && outcome.error
      ? String(outcome.error)
      : `${(outcome && outcome.stderr) || ""}`.trim() || `exit:${outcome && outcome.exitCode}`;
  taskQueue.markFailed(id, errBlob);
  safety.auditLog({
    eventType: "task_failed",
    taskId: id,
    actor: actorFrom(req, "http_run"),
    correlationId,
    metadata: { manual: true, snippet: String(errBlob).slice(0, 400), routePath },
  });
  logEvent("task_failed", routePath, id, false);
  const fresh = taskQueue.getTaskById(id);
  try {
    const tm = require("../memory/taskMemory");
    tm.recordTerminalTask(fresh, "failed", outcome);
  } catch (_tm) {}
  return res.status(200).json(ok({ outcome, task: fresh }));
}

router.post("/api/bridge/tasks", (req, res) => {
  try {
    let task;
    try {
      task = createTask(req.body || {});
    } catch (ve) {
      logEvent("task_created", "POST /api/bridge/tasks", null, false);
      safety.auditLog({
        eventType: "task_created",
        taskId: null,
        actor: actorFrom(req, "patrick"),
        metadata: { error: ve.message || String(ve) },
      });
      return res.status(400).json({ success: false, error: ve.message || String(ve) });
    }

    const risk = safety.assessRisk(task);
    if (risk.requiresApproval) task.approvalRequired = true;

    const enq = taskQueue.enqueueTask(task);
    if (!enq.ok) {
      logEvent("task_created", "POST /api/bridge/tasks", task.taskId, false);
      safety.auditLog({
        eventType: "task_created",
        taskId: task.taskId,
        actor: actorFrom(req, task.requestedBy),
        metadata: { enqueueFailed: true, riskLevel: risk.riskLevel },
      });
      return res.status(400).json({ success: false, error: enq.error || "enqueue_failed" });
    }

    safety.auditLog({
      eventType: "task_created",
      taskId: task.taskId,
      actor: actorFrom(req, task.requestedBy),
      metadata: {
        intent: task.intent,
        riskLevel: risk.riskLevel,
        reasons: risk.reasons,
      },
    });

    logEvent("task_created", "POST /api/bridge/tasks", task.taskId, true);
    try {
      const ae = require("../workflow/approvalEngine");
      ae.ensurePendingRequestForTask(task, actorFrom(req, task.requestedBy), risk);
    } catch (_apr) {}

    return res.status(200).json(ok({ taskId: task.taskId, task, riskAssessment: risk }));
  } catch (e) {
    logEvent("task_created", "POST /api/bridge/tasks", null, false);
    safety.auditLog({
      eventType: "task_failed",
      taskId: null,
      actor: actorFrom(req),
      metadata: { phase: "task_create", error: e.message || String(e) },
    });
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/bridge/tasks/pending", (_req, res) => {
  try {
    return res.status(200).json(ok(taskQueue.getPendingTasks()));
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/bridge/tasks/approved", (_req, res) => {
  try {
    return res.status(200).json(ok(taskQueue.getApprovedTasks()));
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/bridge/tasks/history", (_req, res) => {
  try {
    return res.status(200).json(ok(taskQueue.getTaskHistory(50)));
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/bridge/tasks/:id", (req, res) => {
  try {
    const t = taskQueue.getTaskById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: "task_not_found" });
    return res.status(200).json(ok(t));
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.post("/api/bridge/tasks/:id/approve", (req, res) => {
  try {
    const id = req.params.id;
    const t = taskQueue.getTaskById(id);
    if (!t) return res.status(404).json({ success: false, error: "task_not_found" });
    if (t.status !== "pending") return res.status(400).json({ success: false, error: `invalid_status:${t.status}` });

    const out = taskQueue.approveTask(id);
    if (!out.ok) {
      logEvent("task_approved", "POST /api/bridge/tasks/:id/approve", id, false);
      safety.auditLog({
        eventType: "task_approved",
        taskId: id,
        actor: actorFrom(req),
        metadata: { error: out.error },
      });
      return res.status(400).json({ success: false, error: out.error });
    }

    safety.auditLog({
      eventType: "task_approved",
      taskId: id,
      actor: actorFrom(req),
      metadata: {},
    });
    logEvent("task_approved", "POST /api/bridge/tasks/:id/approve", id, true);

    try {
      const ae = require("../workflow/approvalEngine");
      ae.approvePendingForTask(id, actorFrom(req));
    } catch (_ap) {}

    return res.status(200).json(ok(out.task));
  } catch (e) {
    logEvent("task_approved", "POST /api/bridge/tasks/:id/approve", req.params.id || null, false);
    safety.auditLog({
      eventType: "task_failed",
      taskId: req.params.id || null,
      actor: actorFrom(req),
      metadata: { phase: "approve", error: e.message || String(e) },
    });
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.post("/api/bridge/tasks/:id/reject", (req, res) => {
  try {
    const id = req.params.id;
    const t = taskQueue.getTaskById(id);
    if (!t) return res.status(404).json({ success: false, error: "task_not_found" });
    if (t.status !== "pending") return res.status(400).json({ success: false, error: `invalid_status:${t.status}` });

    const reason = req.body && req.body.reason ? String(req.body.reason) : "rejected";
    const out = taskQueue.rejectTask(id, reason);
    if (!out.ok) {
      logEvent("task_rejected", "POST /api/bridge/tasks/:id/reject", id, false);
      safety.auditLog({
        eventType: "task_rejected",
        taskId: id,
        actor: actorFrom(req),
        metadata: { error: out.error },
      });
      return res.status(400).json({ success: false, error: out.error });
    }

    safety.auditLog({
      eventType: "task_rejected",
      taskId: id,
      actor: actorFrom(req),
      metadata: { reason },
    });
    logEvent("task_rejected", "POST /api/bridge/tasks/:id/reject", id, true);

    try {
      const tm = require("../memory/taskMemory");
      tm.recordTerminalTask(out.task, "rejected", null);
    } catch (_tm) {}

    return res.status(200).json(ok(out.task));
  } catch (e) {
    logEvent("task_rejected", "POST /api/bridge/tasks/:id/reject", req.params.id || null, false);
    safety.auditLog({
      eventType: "task_failed",
      taskId: req.params.id || null,
      actor: actorFrom(req),
      metadata: { phase: "reject", error: e.message || String(e) },
    });
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.post("/api/bridge/tasks/:id/rerun", async (req, res) => {
  const routePath = "POST /api/bridge/tasks/:id/rerun";
  const id = req.params.id || "";
  try {
    const force = !!(req.body && req.body.force === true);
    if (!force) {
      return res.status(400).json({ success: false, error: "force_required_boolean_true" });
    }

    let t = taskQueue.getTaskById(id);
    if (!t) {
      logEvent("task_run_requested", routePath, id || null, false);
      return res.status(404).json({ success: false, error: "task_not_found" });
    }

    const st = String(t.status || "");
    if (st === "completed") {
      safety.auditLog({
        eventType: "task_failed",
        taskId: id,
        actor: actorFrom(req, "rerun"),
        metadata: { reason: "cannot_rerun_completed" },
      });
      return res.status(400).json({ success: false, error: "cannot_rerun_completed" });
    }
    if (st === "running") {
      return res.status(409).json({ success: false, error: "duplicate_execution_running" });
    }
    if (st === "failed") {
      const reopen = taskQueue.reopenFailedTask(id);
      if (!reopen || !reopen.ok) {
        return res.status(400).json({ success: false, error: reopen && reopen.error ? reopen.error : "reopen_failed" });
      }
      safety.auditLog({
        eventType: "task_recovered",
        taskId: id,
        actor: actorFrom(req, "rerun"),
        metadata: { phase: "failed_to_reopen_for_rerun", routePath },
      });
    }

    t = taskQueue.getTaskById(id);
    if (!t || String(t.status || "") !== "approved") {
      return res.status(400).json({ success: false, error: "rerun_requires_approved_after_reopen", current: t && t.status });
    }

    return executeManualRunner(req, res, id, routePath, t);
  } catch (e) {
    safety.auditLog({
      eventType: "task_failed",
      taskId: id || null,
      actor: actorFrom(req, "rerun"),
      metadata: { exception: String(e.message || e) },
    });
    logEvent("task_failed", routePath, id || null, false);
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.post("/api/bridge/tasks/:id/run", async (req, res) => {
  const routePath = "POST /api/bridge/tasks/:id/run";
  const id = req.params.id || "";

  try {
    const t = taskQueue.getTaskById(id);
    if (!t) {
      logEvent("task_run_requested", routePath, id || null, false);
      return res.status(404).json({ success: false, error: "task_not_found" });
    }

    const st = String(t.status || "");
    if (st === "completed") {
      safety.auditLog({
        eventType: "task_failed",
        taskId: id,
        actor: actorFrom(req, "http_run"),
        metadata: { reason: "cannot_rerun_completed" },
      });
      logEvent("task_run_requested", routePath, id, false);
      return res.status(400).json({ success: false, error: "cannot_rerun_completed" });
    }
    if (st === "failed") {
      logEvent("task_run_requested", routePath, id, false);
      safety.auditLog({
        eventType: "task_failed",
        taskId: id,
        actor: actorFrom(req, "http_run"),
        metadata: { hint: "use_POST_rerun_with_force_true" },
      });
      return res.status(400).json({ success: false, error: "requires_rerun_with_force_true" });
    }
    if (st === "running") {
      logEvent("task_run_requested", routePath, id, false);
      return res.status(409).json({ success: false, error: "duplicate_execution_running" });
    }
    if (st !== "approved") {
      logEvent("task_run_requested", routePath, id, false);
      return res.status(400).json({
        success: false,
        error: `execution_requires_approved_status:current=${st}`,
      });
    }

    return executeManualRunner(req, res, id, routePath, t);
  } catch (e) {
    try {
      taskQueue.markFailed(id, e.message || String(e));
    } catch (_e2) {}
    try {
      safety.recordExecution(id);
    } catch (_r2) {}
    safety.auditLog({
      eventType: "task_failed",
      taskId: id || null,
      actor: actorFrom(req, "http_run"),
      metadata: { exception: e.message || String(e) },
    });
    logEvent("task_failed", routePath, id || null, false);
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

module.exports = router;
