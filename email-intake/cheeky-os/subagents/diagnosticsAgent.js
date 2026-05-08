"use strict";

const fs = require("fs");
const taskQueue = require("../agent/taskQueue");
const processor = require("../agent/taskProcessor");
const safety = require("../agent/safetyGuard");

function queueIntegrity() {
  try {
    const tasks = taskQueue.readAllTasksSync();
    const ids = {};
    const dup = [];
    tasks.forEach((t) => {
      if (!t.taskId) return;
      const id = String(t.taskId);
      if (ids[id]) dup.push(id);
      ids[id] = true;
    });
    return { ok: !dup.length, duplicateIds: dup, total: tasks.length };
  } catch (_e) {
    return { ok: false };
  }
}

function auditQuick() {
  try {
    if (!fs.existsSync(safety.AUDIT_FILE)) return { lines: 0 };
    return {
      lines: fs.readFileSync(safety.AUDIT_FILE, "utf8").split(/\r?\n/).filter((ln) => ln.trim()).length,
    };
  } catch (_e) {
    return { lines: 0 };
  }
}

function describe() {
  try {
    const aq = auditQuick();
    return {
      readonly: true,
      processorHb: processor.readHb(),
      rateLimitPreview: safety.rateLimitCheck(),
      queueIntegrity: queueIntegrity(),
      auditTrailLines: aq.lines || 0,
      transportConfigured: !!(process.env.CHEEKY_TRANSPORT_KEY || "").trim().length,
      agentIntelV31Routes: ["/api/agent-intel/v31/ping", "/api/agent-intel/v31/semantic/related"],
    };
  } catch (e) {
    return {
      readonly: true,
      error: e.message || String(e),
    };
  }
}

module.exports = {
  describe,
  queueIntegrity,
  auditQuick,
};
