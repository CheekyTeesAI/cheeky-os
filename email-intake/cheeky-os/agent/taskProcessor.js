"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const taskQueue = require("./taskQueue");
const agentRunner = require("./agentRunner");
const safety = require("./safetyGuard");
const processorLock = require("./processorLock");

const HB_FILE = path.join(taskQueue.DATA_DIR, "processor-status.json");

/** @type {ReturnType<typeof setInterval> | null} */
let intervalHandle = null;
/** In-process mutex */
let isProcessingLock = false;

function readHb() {
  taskQueue.ensureDirAndFiles();
  try {
    if (!fs.existsSync(HB_FILE)) {
      return {
        lastTick: null,
        isProcessing: false,
        tasksProcessedToday: 0,
        lastTaskId: null,
        lastResetDate: "",
      };
    }
    return Object.assign(
      {
        lastTick: null,
        isProcessing: false,
        tasksProcessedToday: 0,
        lastTaskId: null,
        lastResetDate: "",
      },
      JSON.parse(fs.readFileSync(HB_FILE, "utf8"))
    );
  } catch (_e) {
    return {
      lastTick: null,
      isProcessing: false,
      tasksProcessedToday: 0,
      lastTaskId: null,
      lastResetDate: "",
    };
  }
}

function writeHb(partial) {
  try {
    const cur = readHb();
    const next = Object.assign({}, cur, partial);
    fs.writeFileSync(HB_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch (_e) {}
}

function utcDateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function bumpProcessedCount() {
  const now = new Date();
  const key = utcDateKey(now);
  const hb = readHb();
  let count = typeof hb.tasksProcessedToday === "number" ? hb.tasksProcessedToday : 0;
  if (!hb.lastResetDate || hb.lastResetDate !== key) {
    count = 0;
  }
  count += 1;
  writeHb({ tasksProcessedToday: count, lastResetDate: key });
}

async function processNextApprovedTask() {
  if (isProcessingLock) return { ok: true, skipped: "already_processing" };

  processorLock.ensureLockRecoverable();

  if (!processorLock.tryAcquireLease(null)) {
    writeHb({
      lastTick: new Date().toISOString(),
      isProcessing: false,
      lastResetDate: readHb().lastResetDate || utcDateKey(new Date()),
    });
    return { ok: false, skipped: "processor_lease_busy" };
  }

  try {
    isProcessingLock = true;
    processorLock.touchHeartbeat({});

    const hb0 = readHb();
    writeHb({
      lastTick: new Date().toISOString(),
      isProcessing: true,
      lastResetDate: hb0.lastResetDate || utcDateKey(new Date()),
    });

    const rl = safety.rateLimitCheck();
    if (!rl.allowed) {
      safety.auditLog({
        eventType: "rate_limit_hit",
        taskId: null,
        actor: "processor",
        metadata: safety.standardizedRateLimitHttpBody(rl),
      });
      writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
      return { ok: false, skipped: rl.reason };
    }

    processorLock.touchHeartbeat({});

    const approved = taskQueue.getApprovedTasks();
    if (!approved.length) {
      writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
      return { ok: true, skipped: "no_approved_tasks" };
    }

    const task = approved[0];
    const freshApprove = taskQueue.getTaskById(task.taskId);
    if (!freshApprove || freshApprove.status !== "approved") {
      writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
      return { ok: true, skipped: "approved_task_no_longer_valid" };
    }

    processorLock.touchHeartbeat({ taskId: task.taskId });

    const correlationId =
      typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;

    /** @type {object} */
    const taskRun = Object.assign({}, task, { executionCorrelationId: correlationId });

    try {
      const cool = require("../services/taskFailCooldown");
      const cd = cool.isCoolingDown(task.taskId);
      if (cd.cooling) {
        safety.auditLog({
          eventType: "processor_skip",
          taskId: task.taskId,
          actor: "processor",
          correlationId,
          metadata: { reason: "task_fail_cooldown", retryAfterMs: cd.retryAfterMs, channel: "processor" },
        });
        writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
        return { ok: true, skipped: "task_fail_cooldown", retryAfterMs: cd.retryAfterMs };
      }
    } catch (_cd) {}

    try {
      const ae = require("../workflow/approvalEngine");
      const gate = ae.verifyExecutionAllowed(taskRun);
      if (!gate || !gate.allowed) {
        safety.auditLog({
          eventType: "processor_skip",
          taskId: task.taskId,
          actor: "processor",
          correlationId,
          metadata: {
            reason: "approval_workflow_gate",
            detail: gate && gate.reason,
            channel: "processor",
          },
        });
        writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
        return { ok: true, skipped: "approval_blocked", detail: gate && gate.reason };
      }
    } catch (_ge) {
      safety.auditLog({
        eventType: "processor_skip",
        taskId: task.taskId,
        actor: "processor",
        correlationId,
        metadata: { reason: "approval_verify_error_fail_closed", channel: "processor" },
      });
      writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
      return { ok: false, skipped: "approval_verify_error" };
    }

    safety.auditLog({
      eventType: "task_started",
      taskId: task.taskId,
      actor: "processor",
      correlationId,
      metadata: { intent: task.intent, channel: "processor" },
    });

    taskQueue.updateTaskStatus(task.taskId, "running", {
      runningStartedAt: new Date().toISOString(),
    });

    const execStartMs = Date.now();
    const outcome = await agentRunner.runTask(taskRun);
    try {
      const traceEngine = require("../diagnostics/traceEngine");
      const durationMs = Math.max(0, Date.now() - execStartMs);
      traceEngine.recordTrace({
        traceId: traceEngine.newId("proc"),
        correlationId,
        requestPath: "processor/processNextApprovedTask",
        taskId: task.taskId,
        startedAt: new Date(execStartMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
        success: !!(outcome && (outcome.success === true || outcome.ok === true)),
        error:
          outcome && (outcome.error || outcome.stderr)
            ? String(outcome.error || outcome.stderr || "").slice(0, 500)
            : null,
      });
    } catch (_te) {}
    try {
      const mc = require("../diagnostics/metricsCollector");
      mc.noteTaskDurationMs(Date.now() - execStartMs, !!(outcome && (outcome.success === true || outcome.ok === true)));
      mc.sampleQueueDepth(taskQueue.readAllTasksSync().length);
      const ae = require("../workflow/approvalEngine");
      mc.sampleApprovalBacklog(ae.getPendingApprovals().length);
      mc.bumpProcessorRun();
    } catch (_mc) {}

    try {
      safety.recordExecution(task.taskId);
    } catch (_rec) {}

    if (outcome && (outcome.success === true || outcome.ok === true)) {
      taskQueue.markCompleted(task.taskId, outcome);
      safety.auditLog({
        eventType: "task_completed",
        taskId: task.taskId,
        actor: "processor",
        metadata: {},
      });
      try {
        const tm = require("../memory/taskMemory");
        tm.recordTerminalTask(taskQueue.getTaskById(task.taskId), "completed", outcome);
      } catch (_tm) {}
    } else {
      const err =
        outcome && outcome.error
          ? String(outcome.error)
          : `${outcome.stderr || ""}`.trim() || `exit:${outcome && outcome.exitCode}`;
      taskQueue.markFailed(task.taskId, err);
      safety.auditLog({
        eventType: "task_failed",
        taskId: task.taskId,
        actor: "processor",
        metadata: { errorPreview: String(err || "").slice(0, 500) },
      });
      try {
        const tm = require("../memory/taskMemory");
        tm.recordTerminalTask(taskQueue.getTaskById(task.taskId), "failed", outcome);
      } catch (_tm) {}
    }

    bumpProcessedCount();
    writeHb({
      lastTaskId: task.taskId,
      isProcessing: false,
      lastTick: new Date().toISOString(),
    });

    return { ok: true, processed: task.taskId };
  } catch (e) {
    safety.auditLog({
      eventType: "task_failed",
      taskId: null,
      actor: "processor",
      metadata: { processorError: e && e.message ? e.message : String(e) },
    });
    writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  } finally {
    try {
      processorLock.releaseLease();
    } catch (_r) {}
    isProcessingLock = false;
  }
}

function startProcessor(intervalMs) {
  try {
    stopProcessor();

    safety.auditLog({
      eventType: "processor_started",
      taskId: null,
      actor: "processor",
      metadata: { intervalMs: Number(intervalMs || 30000) },
    });

    const ms = Number(intervalMs);
    const tickMs = Number.isFinite(ms) && ms >= 5000 ? ms : 30000;

    processorLock.ensureLockRecoverable();

    intervalHandle = setInterval(() => {
      processNextApprovedTask().catch((_e) => {});
    }, tickMs);
    const h = intervalHandle;

    if (h !== null && typeof h.unref === "function") {
      h.unref();
    }

    console.log(`[agent-processor] started intervalMs=${tickMs}`);
  } catch (e) {
    console.warn("[agent-processor] start failed:", e && e.message ? e.message : e);
  }
}

function stopProcessor() {
  try {
    const hadInterval = !!intervalHandle;
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
    processorLock.ensureLockRecoverable();
    processorLock.releaseLease();

    if (hadInterval) {
      safety.auditLog({
        eventType: "processor_stopped",
        taskId: null,
        actor: "processor",
        metadata: { note: "stopProcessor_called" },
      });
    }

    writeHb({ isProcessing: false, lastTick: new Date().toISOString() });
  } catch (_e) {}
}

module.exports = {
  startProcessor,
  stopProcessor,
  processNextApprovedTask,
  readHb,
};
