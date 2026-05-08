"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const FILE = path.join(taskQueue.DATA_DIR, "incidents.jsonl");

function recordIncident(incident) {
  try {
    taskQueue.ensureDirAndFiles();
    const row = Object.assign({}, incident || {}, {
      incidentId:
        incident && incident.incidentId
          ? String(incident.incidentId)
          : typeof require("crypto").randomUUID === "function"
            ? require("crypto").randomUUID()
            : `inc-${Date.now()}`,
      at: new Date().toISOString(),
    });
    fs.appendFileSync(FILE, `${JSON.stringify(row)}\n`, "utf8");

    try {
      const tl = require("./executionTimeline");
      tl.appendTimelineEvent({
        phase: "incident",
        severity: row.severity,
        type: row.type,
        taskId: row.taskId || null,
      });
    } catch (_tl) {}

    return { ok: true, incident: row };
  } catch (_e) {
    return { ok: false };
  }
}

/** @returns {object[]} */
function tailIncidents(limit) {
  try {
    taskQueue.ensureDirAndFiles();
    const n = Math.min(500, Math.max(10, Number(limit) || 80));
    if (!fs.existsSync(FILE)) return [];
    const ln = fs.readFileSync(FILE, "utf8").split(/\r?\n/).filter(Boolean).slice(-n);
    /** @type {object[]} */
    const out = [];
    for (let i = 0; i < ln.length; i++) {
      try {
        out.push(JSON.parse(ln[i]));
      } catch (_e2) {}
    }
    return out;
  } catch (_e) {
    return [];
  }
}

module.exports = { FILE, recordIncident, tailIncidents };
