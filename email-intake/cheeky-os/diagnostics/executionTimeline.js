"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const FILE = path.join(taskQueue.DATA_DIR, "execution-timeline.jsonl");

function appendTimelineEvent(ev) {
  try {
    taskQueue.ensureDirAndFiles();
    const row = Object.assign({}, ev || {}, {
      at: ev && ev.at ? ev.at : new Date().toISOString(),
      kind: ev && ev.kind ? ev.kind : "timeline_step",
    });
    fs.appendFileSync(FILE, `${JSON.stringify(row)}\n`, "utf8");
    return { ok: true };
  } catch (_e) {
    return { ok: false };
  }
}

/** @returns {object[]} */
function tailTimeline(limit) {
  try {
    taskQueue.ensureDirAndFiles();
    const n = Math.min(600, Math.max(10, Number(limit) || 120));
    if (!fs.existsSync(FILE)) return [];
    const ln = fs.readFileSync(FILE, "utf8").split(/\r?\n/).filter(Boolean);
    /** @type {object[]} */
    const out = [];
    const slice = ln.slice(-n);
    for (let i = 0; i < slice.length; i++) {
      try {
        out.push(JSON.parse(slice[i]));
      } catch (_e2) {}
    }
    return out;
  } catch (_e) {
    return [];
  }
}

module.exports = { FILE, appendTimelineEvent, tailTimeline };
