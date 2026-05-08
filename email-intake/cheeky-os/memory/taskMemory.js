"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const MEMORY_FILE = path.join(taskQueue.DATA_DIR, "task-memory.jsonl");

function memoryId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `mem-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  } catch (_e) {
    return `mem-${Date.now()}`;
  }
}

function appendRow(row) {
  try {
    taskQueue.ensureDirAndFiles();
    fs.appendFileSync(MEMORY_FILE, `${JSON.stringify(row)}\n`, "utf8");
    try {
      const memoryIndexer = require("./memoryIndexer");
      memoryIndexer.indexOne(row);
    } catch (_ix) {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * @param {object} taskSnapshot
 * @param {string} outcome completed|failed|rejected
 * @param {object=} runnerOutcome
 */
function recordTerminalTask(taskSnapshot, outcome, runnerOutcome) {
  try {
    if (!taskSnapshot || !taskSnapshot.taskId) return { ok: false, error: "missing_task" };
    const reqs = Array.isArray(taskSnapshot.requirements) ? taskSnapshot.requirements : [];
    const summary =
      `${String(taskSnapshot.intent || "?")} :: ${String(taskSnapshot.target || "").slice(0, 120)} :: ${reqs[0] || ""}`.slice(
        0,
        500
      );
    const tags = Array.from(
      new Set(
        [
          String(taskSnapshot.intent || ""),
          String(taskSnapshot.priority || ""),
          slugTag(taskSnapshot.target),
        ].filter(Boolean)
      )
    );

    const row = {
      memoryId: memoryId(),
      taskId: String(taskSnapshot.taskId),
      category: String(taskSnapshot.intent || "task"),
      targetKey: slugTag(taskSnapshot.target),
      summary,
      tags,
      outcome: String(outcome || "unknown"),
      timestamp: new Date().toISOString(),
      metadata: {
        status: taskSnapshot.status,
        runnerPreview:
          runnerOutcome && typeof runnerOutcome === "object"
            ? {
                success: !!(runnerOutcome.success || runnerOutcome.ok),
                mode: runnerOutcome.mode,
                error: runnerOutcome.error ? String(runnerOutcome.error).slice(0, 200) : null,
              }
            : {},
      },
    };

    return appendRow(row);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function slugTag(s) {
  try {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 48)
      .replace(/^-+|-+$/g, "");
  } catch (_e) {
    return "";
  }
}

function loadAllSync() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(MEMORY_FILE)) return [];
    const rows = [];
    const raw = fs.readFileSync(MEMORY_FILE, "utf8");
    raw.split(/\r?\n/).forEach((ln) => {
      if (!ln || !ln.trim()) return;
      try {
        rows.push(JSON.parse(ln));
      } catch (_e) {}
    });
    return rows;
  } catch (_e) {
    return [];
  }
}

module.exports = {
  MEMORY_FILE,
  appendRow,
  recordTerminalTask,
  loadAllSync,
};
