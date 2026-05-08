"use strict";

/**
 * Startup recovery — stale RUNNING tasks (crash mid-run / restart gap).
 */

const taskQueue = require("./taskQueue");
const safety = require("./safetyGuard");

const RUNNING_STALE_MS = 30 * 60 * 1000;

function parseTs(isoOrMs) {
  try {
    if (isoOrMs == null) return NaN;
    const n = typeof isoOrMs === "number" ? isoOrMs : new Date(String(isoOrMs)).getTime();
    return Number.isFinite(n) ? n : NaN;
  } catch (_e) {
    return NaN;
  }
}

function runStaleRunningRecovery() {
  const recoveredIds = [];
  try {
    taskQueue.ensureDirAndFiles();
    const tasks = taskQueue.readAllTasksSync();
    const nowMs = Date.now();

    for (let i = 0; i < tasks.length; i++) {
      try {
        const t = tasks[i];
        if (!t || String(t.status) !== "running") continue;

        const startCandidate = parseTs(t.runningStartedAt) || parseTs(t.updatedAt);
        if (!Number.isFinite(startCandidate)) continue;
        if (nowMs - startCandidate < RUNNING_STALE_MS) continue;

        taskQueue.markFailed(t.taskId, "processor_restart_recovery");
        recoveredIds.push(String(t.taskId));

        safety.auditLog({
          eventType: "task_recovered",
          taskId: t.taskId,
          actor: "orchestrationRecovery",
          metadata: {
            phase: "stale_running_to_failed",
            runningStartedAt: t.runningStartedAt || null,
            priorUpdatedAt: t.updatedAt || null,
          },
        });
      } catch (_row) {}
    }

    return { ok: true, recovered: recoveredIds.length, taskIds: recoveredIds };
  } catch (e) {
    try {
      safety.auditLog({
        eventType: "task_failed",
        taskId: null,
        actor: "orchestrationRecovery",
        metadata: { startupRecoveryError: String(e.message || e) },
      });
    } catch (_a2) {}
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = {
  RUNNING_STALE_MS,
  runStaleRunningRecovery,
};
