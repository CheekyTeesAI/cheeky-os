"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("./taskQueue");

const DATA_DIR = path.join(__dirname, "..", "data");
const AUDIT_FILE = path.join(DATA_DIR, "audit-trail.jsonl");
const RATE_FILE = path.join(DATA_DIR, "rate-limit.json");

const MAX_EXECUTIONS_PER_HOUR = 10;
const WINDOW_MS = 60 * 60 * 1000;

function isoNow() {
  return new Date().toISOString();
}

/**
 * @param {object} taskObj
 * @returns {{ riskLevel: string, reasons: string[], requiresApproval: boolean }}
 */
function assessRisk(taskObj) {
  try {
    /** @type {string[]} */
    const reasons = [];
    let tier = 0;

    function bump(n) {
      tier = Math.min(2, Math.max(tier, n));
    }

    const priority = String(taskObj.priority || "").trim().toLowerCase();
    const intent = String(taskObj.intent || "").trim().toLowerCase();
    const reqLen = Array.isArray(taskObj.requirements) ? taskObj.requirements.length : 0;

    if (priority === "critical") {
      bump(2);
      reasons.push("critical_priority");
    }

    if (intent === "execute") {
      bump(2);
      reasons.push("execute_intent");
    } else if (intent === "build") {
      bump(1);
      reasons.push("build_intent");
    }

    if (reqLen > 5) {
      tier = Math.min(2, tier + 1);
      reasons.push("requirements_gt_5");
    }

    const riskLevel = tier >= 2 ? "high" : tier === 1 ? "medium" : "low";

    const requiresApproval = riskLevel === "high";

    return { riskLevel, reasons, requiresApproval };
  } catch (_e) {
    return { riskLevel: "high", reasons: ["assess_error_fail_closed"], requiresApproval: true };
  }
}

function readRateState() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(RATE_FILE)) {
      return { executions: [] };
    }
    const raw = fs.readFileSync(RATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { executions: [] };
    const ex = Array.isArray(parsed.executions) ? parsed.executions : [];
    const legacy = Array.isArray(parsed.submissions) ? parsed.submissions : [];
    if (ex.length) return { executions: ex };
    return { executions: legacy };
  } catch (_e) {
    return { executions: [] };
  }
}

function writeRateState(state) {
  try {
    taskQueue.ensureDirAndFiles();
    fs.writeFileSync(RATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (_e) {}
}

/**
 * Call after each task execution completes (manual / processor).
 * @param {string} taskId
 */
function recordExecution(taskId) {
  try {
    const now = Date.now();
    const st = readRateState();
    const prev = Array.isArray(st.executions) ? st.executions : [];
    const fresh = prev.filter((x) => x && now - Number(x.ts || 0) < WINDOW_MS);
    fresh.push({ ts: now, taskId: String(taskId || "") });
    writeRateState({ executions: fresh });
  } catch (_e) {}
}

function rateLimitCheck() {
  try {
    const now = Date.now();
    const st = readRateState();
    const raw = Array.isArray(st.executions) ? st.executions : [];
    const fresh = raw.filter((x) => x && now - Number(x.ts || 0) < WINDOW_MS);
    const tasksThisHour = fresh.length;
    const limit = MAX_EXECUTIONS_PER_HOUR;

    /** seconds until earliest execution slot rolls out */
    let retryAfterSeconds = 0;
    if (!fresh.length) retryAfterSeconds = 0;
    else {
      let oldestTs = Infinity;
      for (let i = 0; i < fresh.length; i++) {
        oldestTs = Math.min(oldestTs, Number(fresh[i].ts || now));
      }
      if (!Number.isFinite(oldestTs)) retryAfterSeconds = 60;
      else retryAfterSeconds = Math.max(1, Math.ceil((oldestTs + WINDOW_MS - now) / 1000));
    }

    if (tasksThisHour >= limit) {
      return {
        allowed: false,
        reason: "rate_limit_exceeded",
        tasksThisHour,
        limit,
        retryAfterSeconds,
      };
    }
    return {
      allowed: true,
      reason: "ok",
      tasksThisHour,
      limit,
      retryAfterSeconds: 0,
    };
  } catch (_e) {
    return {
      allowed: false,
      reason: "rate_check_error_fail_closed",
      tasksThisHour: 0,
      limit: MAX_EXECUTIONS_PER_HOUR,
      retryAfterSeconds: 60,
    };
  }
}

/**
 * Canonical 429 envelope for orchestration executions.
 */
function standardizedRateLimitHttpBody(rl) {
  try {
    return {
      success: false,
      error: "rate_limit_exceeded",
      tasksThisHour: rl && rl.tasksThisHour != null ? rl.tasksThisHour : 0,
      limit: rl && rl.limit != null ? rl.limit : MAX_EXECUTIONS_PER_HOUR,
      retryAfterSeconds:
        rl && rl.retryAfterSeconds != null ? rl.retryAfterSeconds : 60,
    };
  } catch (_e) {
    return {
      success: false,
      error: "rate_limit_exceeded",
      tasksThisHour: 0,
      limit: MAX_EXECUTIONS_PER_HOUR,
      retryAfterSeconds: 60,
    };
  }
}

/**
 * @param {object} event
 */
function auditLog(event) {
  try {
    taskQueue.ensureDirAndFiles();
    const md = Object.assign({}, event.metadata && typeof event.metadata === "object" ? event.metadata : {});
    if (event.correlationId != null && md.correlationId == null) {
      md.correlationId = String(event.correlationId);
    }
    const row = {
      auditId:
        typeof require("crypto").randomUUID === "function"
          ? require("crypto").randomUUID()
          : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      eventType: String(event.eventType || "unknown"),
      taskId: event.taskId != null ? String(event.taskId) : null,
      actor: event.actor != null ? String(event.actor) : "system",
      timestamp: event.timestamp || isoNow(),
      metadata: md,
    };
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(row)}\n`, "utf8");
  } catch (_e) {}
}

module.exports = {
  assessRisk,
  rateLimitCheck,
  recordExecution,
  auditLog,
  standardizedRateLimitHttpBody,
  MAX_EXECUTIONS_PER_HOUR,
  WINDOW_MS,
  AUDIT_FILE,
  RATE_FILE,
};
