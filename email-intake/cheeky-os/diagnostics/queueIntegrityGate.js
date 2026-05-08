"use strict";

/**
 * JSONL task queue line validation (additive; mirrors quarantine semantics).
 */

const fs = require("fs");

const taskQueue = require("../agent/taskQueue");

function validateTaskQueueFile() {
  try {
    const p = taskQueue.TASK_QUEUE_FILE;
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(p)) return { ok: true, totalLines: 0, validRows: 0, badLines: 0, corrupted: false };

    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split(/\r?\n/);
    let valid = 0;
    let bad = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln || !ln.trim()) continue;
      try {
        const o = JSON.parse(ln);
        if (o && typeof o === "object" && o.taskId) valid += 1;
        else bad += 1;
      } catch (_e) {
        bad += 1;
      }
    }
    return {
      ok: bad === 0,
      totalLines: lines.filter((x) => x && x.trim()).length,
      validRows: valid,
      badLines: bad,
      corrupted: bad > 0,
    };
  } catch (e) {
    return { ok: false, corrupted: true, error: e.message || String(e), validRows: 0, badLines: 0 };
  }
}

module.exports = { validateTaskQueueFile };
