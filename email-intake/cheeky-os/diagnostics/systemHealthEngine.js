"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const taskProcessor = require("../agent/taskProcessor");
const processorLock = require("../agent/processorLock");
const safety = require("../agent/safetyGuard");

function isoNow() {
  return new Date().toISOString();
}

function parseJsonlFile(filePath, maxLines) {
  const n = Math.min(2000, Math.max(20, Number(maxLines) || 400));
  /** @type {object[]} */
  const out = [];
  try {
    if (!fs.existsSync(filePath)) return { ok: true, rows: [], badLines: 0 };
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    const slice = lines.slice(-n);
    let bad = 0;
    for (let i = 0; i < slice.length; i++) {
      try {
        out.push(JSON.parse(slice[i]));
      } catch (_e) {
        bad += 1;
      }
    }
    return { ok: bad === 0, rows: out, badLines: bad };
  } catch (e) {
    return { ok: false, rows: [], badLines: 0, error: e.message || String(e) };
  }
}

function ageMs(iso) {
  try {
    if (!iso) return Infinity;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return Infinity;
    return Date.now() - t;
  } catch (_e) {
    return Infinity;
  }
}

function gradeFromChecks(checks) {
  try {
    if (checks.some((c) => c.status === "critical")) return "critical";
    if (checks.some((c) => c.status === "degraded")) return "degraded";
    if (checks.some((c) => c.status === "warning")) return "warning";
    return "healthy";
  } catch (_e) {
    return "critical";
  }
}

/**
 * @returns {{ overallGrade: string, checks: object[], generatedAt: string }}
 */
function summarizeHealth() {
  taskQueue.ensureDirAndFiles();

  /** @type {object[]} */
  const checks = [];

  const qParse = parseJsonlFile(taskQueue.TASK_QUEUE_FILE, 500);
  checks.push({
    name: "queue_integrity",
    status: qParse.ok && !qParse.badLines ? "ok" : qParse.badLines ? "degraded" : "warning",
    detail: qParse.badLines ? `bad_json_lines:${qParse.badLines}` : "tail_parse_ok",
  });

  const lock = processorLock.readLock();
  const hbAge = processorLock.heartbeatAgeMs(lock);
  const lockStale = lock.isProcessing && hbAge > processorLock.STALE_MS;
  checks.push({
    name: "processor_lock",
    status: lockStale ? "critical" : lock.isProcessing ? "ok" : "ok",
    detail: {
      isProcessing: !!lock.isProcessing,
      heartbeatAgeMs: Number.isFinite(hbAge) && hbAge !== Infinity ? Math.round(hbAge) : null,
    },
  });

  const hb = taskProcessor.readHb();
  const tickAge = ageMs(hb.lastTick);
  checks.push({
    name: "processor_heartbeat_file",
    status: tickAge > 10 * 60 * 1000 && String(process.env.AGENT_PROCESSOR_ENABLED).toLowerCase() === "true"
      ? "warning"
      : "ok",
    detail: { lastTick: hb.lastTick, tickAgeMs: Number.isFinite(tickAge) ? Math.round(tickAge) : null },
  });

  const auditParse = parseJsonlFile(safety.AUDIT_FILE, 200);
  checks.push({
    name: "audit_integrity",
    status: auditParse.ok ? "ok" : "degraded",
    detail: auditParse.badLines ? `bad_json_lines:${auditParse.badLines}` : "tail_parse_ok",
  });

  const eventsParse = parseJsonlFile(path.join(taskQueue.DATA_DIR, "events.jsonl"), 120);
  checks.push({
    name: "event_log_integrity",
    status: eventsParse.ok ? "ok" : "warning",
    detail: eventsParse.badLines ? `bad_json_lines:${eventsParse.badLines}` : "tail_parse_ok",
  });

  const memPath = path.join(taskQueue.DATA_DIR, "task-memory-index.json");
  let memOk = true;
  try {
    if (fs.existsSync(memPath)) JSON.parse(fs.readFileSync(memPath, "utf8"));
  } catch (_e) {
    memOk = false;
  }
  checks.push({
    name: "memory_integrity",
    status: memOk ? "ok" : "warning",
    detail: { file: memPath },
  });

  const st = safety.rateLimitCheck();
  const pressure =
    st && st.limit && st.tasksThisHour != null && st.tasksThisHour / st.limit >= 0.85;
  checks.push({
    name: "rate_limit_pressure",
    status: !st.allowed ? "warning" : pressure ? "warning" : "ok",
    detail: {
      tasksThisHour: st.tasksThisHour,
      limit: st.limit,
      allowed: st.allowed,
    },
  });

  const tasks = taskQueue.readAllTasksSync();
  const failed = tasks.filter((t) => String(t.status) === "failed").length;
  checks.push({
    name: "failed_tasks",
    status: failed > 6 ? "warning" : "ok",
    detail: { count: failed },
  });

  const tok = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  checks.push({
    name: "square_connector_config",
    status: tok.length > 12 ? "ok" : "warning",
    detail: { configured: tok.length > 12 },
  });

  const overallGrade = gradeFromChecks(checks);

  return { overallGrade, checks, generatedAt: isoNow() };
}

function runDiagnostics() {
  const h = summarizeHealth();
  const tasks = taskQueue.readAllTasksSync();
  return {
    health: h,
    taskCounts: {
      total: tasks.length,
      byStatus: tasks.reduce((acc, t) => {
        const k = String(t.status || "unknown");
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    },
    files: {
      queue: taskQueue.TASK_QUEUE_FILE,
      audit: safety.AUDIT_FILE,
      lock: processorLock.LOCK_FILE,
    },
  };
}

function listRecentFailures(max) {
  const n = Math.min(200, Math.max(10, Number(max) || 40));
  const rows = parseJsonlFile(path.join(taskQueue.DATA_DIR, "agent-run-log.jsonl"), 800).rows;
  const fails = rows.filter((r) => r && r.success === false).slice(-n);
  return fails;
}

module.exports = {
  summarizeHealth,
  runDiagnostics,
  listRecentFailures,
};
