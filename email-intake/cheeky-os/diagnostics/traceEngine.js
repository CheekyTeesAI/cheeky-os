"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");

const TRACE_FILE = path.join(taskQueue.DATA_DIR, "execution-traces.jsonl");

function newId(prefix) {
  try {
    if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } catch (_e) {
    return `${prefix}-${Date.now()}`;
  }
}

function recordTrace(row) {
  try {
    taskQueue.ensureDirAndFiles();
    const r = row && typeof row === "object" ? row : {};
    const trace = Object.assign({}, r, {
      traceId: r.traceId || newId("tr"),
      at: new Date().toISOString(),
    });
    fs.appendFileSync(TRACE_FILE, `${JSON.stringify(trace)}\n`, "utf8");
    return trace;
  } catch (_e) {
    return null;
  }
}

function tailTraces(limit) {
  try {
    taskQueue.ensureDirAndFiles();
    const n = Math.min(500, Math.max(10, Number(limit) || 100));
    if (!fs.existsSync(TRACE_FILE)) return [];
    const lines = fs.readFileSync(TRACE_FILE, "utf8").split(/\r?\n/).filter(Boolean).slice(-n);
    /** @type {object[]} */
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        out.push(JSON.parse(lines[i]));
      } catch (_e2) {}
    }
    return out;
  } catch (_e) {
    return [];
  }
}

module.exports = { TRACE_FILE, recordTrace, tailTraces, newId };
