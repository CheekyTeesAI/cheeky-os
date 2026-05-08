"use strict";

let _randomUUID =
  typeof require("crypto").randomUUID === "function" ? require("crypto").randomUUID.bind(require("crypto")) : null;

const PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const STATUSES = new Set(["pending", "approved", "running", "completed", "failed", "rejected"]);

function isoNow() {
  return new Date().toISOString();
}

function safeTaskId(overridesTaskId) {
  const preset = overridesTaskId && String(overridesTaskId).trim();
  if (preset) return preset;
  try {
    if (_randomUUID) return _randomUUID();
  } catch (_e) {
    _randomUUID = null;
  }
  try {
    const { randomBytes } = require("crypto");
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  } catch (_e2) {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * @param {object} overrides
 * @returns {object} task
 */
function createTask(overrides) {
  if (!overrides || typeof overrides !== "object") {
    throw new Error("createTask: overrides must be a non-null object");
  }

  const intent = String(overrides.intent || "").trim();
  const target = String(overrides.target || "").trim();
  const requestedBy = String(overrides.requestedBy != null && overrides.requestedBy !== "" ? overrides.requestedBy : "patrick").trim();

  if (!intent) throw new Error("createTask: intent is required");
  if (!target) throw new Error("createTask: target is required");
  if (!Array.isArray(overrides.requirements)) {
    throw new Error("createTask: requirements is required (non-empty array of strings)");
  }
  const requirements = overrides.requirements.map((r) => String(r));
  if (requirements.length === 0) {
    throw new Error("createTask: requirements must contain at least one entry");
  }

  const priority = String(overrides.priority || "normal").trim().toLowerCase();
  if (!PRIORITIES.has(priority)) {
    throw new Error(`createTask: invalid priority "${priority}" (expected low|normal|high|critical)`);
  }

  const status = String(overrides.status || "pending").trim().toLowerCase();
  if (!STATUSES.has(status)) {
    throw new Error(`createTask: invalid status "${status}"`);
  }

  const taskId = safeTaskId(overrides.taskId);
  const now = isoNow();

  return {
    taskId,
    intent,
    target,
    requirements,
    approvalRequired: Boolean(overrides.approvalRequired),
    priority,
    status,
    createdAt: overrides.createdAt && String(overrides.createdAt).trim() ? String(overrides.createdAt) : now,
    updatedAt: now,
    completedAt: null,
    result: null,
    errorLog: null,
    requestedBy,
  };
}

module.exports = {
  createTask,
  PRIORITIES,
  STATUSES,
};
