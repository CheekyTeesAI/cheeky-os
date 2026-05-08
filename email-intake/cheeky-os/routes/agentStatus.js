"use strict";

const express = require("express");
const fs = require("fs");

const router = express.Router();

const taskQueue = require("../agent/taskQueue");
const safety = require("../agent/safetyGuard");
const processor = require("../agent/taskProcessor");

function tailJsonl(file, maxLines) {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    /** @type {object[]} */
    const rows = [];
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln || !ln.trim()) continue;
      try {
        rows.push(JSON.parse(ln));
      } catch (_e) {
        /* skip corrupt */
      }
    }
    const n = Math.min(Math.max(1, maxLines || 1), rows.length);
    return rows.slice(-n);
  } catch (_e) {
    return [];
  }
}

function queueCounts() {
  try {
    const tasks = taskQueue.readAllTasksSync();
    /** @type {Record<string, number>} */
    const c = {
      pending: 0,
      approved: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (let i = 0; i < tasks.length; i++) {
      const s = tasks[i].status || "";
      if (c[s] !== undefined) c[s]++;
    }
    return c;
  } catch (_e) {
    return { pending: 0, approved: 0, running: 0, completed: 0, failed: 0 };
  }
}

function processorPublicView() {
  try {
    const hb = processor.readHb();
    return {
      lastTick: hb.lastTick != null ? hb.lastTick : null,
      isProcessing: Boolean(hb.isProcessing),
      tasksProcessedToday: typeof hb.tasksProcessedToday === "number" ? hb.tasksProcessedToday : 0,
      lastTaskId: hb.lastTaskId != null ? hb.lastTaskId : null,
    };
  } catch (_e) {
    return {
      lastTick: null,
      isProcessing: false,
      tasksProcessedToday: 0,
      lastTaskId: null,
    };
  }
}

router.get("/api/agent/status", (_req, res) => {
  try {
    taskQueue.ensureDirAndFiles();
    const rl = safety.rateLimitCheck();

    const body = {
      processor: processorPublicView(),
      queue: queueCounts(),
      recentHistory: taskQueue.getTaskHistory(5),
      rateLimit: {
        tasksThisHour: rl.tasksThisHour != null ? rl.tasksThisHour : 0,
        limit: rl.limit != null ? rl.limit : safety.MAX_EXECUTIONS_PER_HOUR,
      },
      auditTrail: tailJsonl(safety.AUDIT_FILE, 10),
    };

    return res.status(200).json(body);
  } catch (e) {
    return res.status(200).json({
      processor: {
        lastTick: null,
        isProcessing: false,
        tasksProcessedToday: 0,
        lastTaskId: null,
      },
      queue: {
        pending: 0,
        approved: 0,
        running: 0,
        completed: 0,
        failed: 0,
      },
      recentHistory: [],
      rateLimit: { tasksThisHour: 0, limit: safety.MAX_EXECUTIONS_PER_HOUR },
      auditTrail: [],
      error: e && e.message ? e.message : String(e),
    });
  }
});

module.exports = router;
