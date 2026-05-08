"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const eventEmitter = require("./eventEmitter");

function parseLines() {
  /** @type {object[]} */
  const rows = [];
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(eventEmitter.EXPANDED_FILE)) return rows;
    const raw = fs.readFileSync(eventEmitter.EXPANDED_FILE, "utf8");
    raw.split(/\r?\n/).forEach((ln) => {
      if (!ln || !ln.trim()) return;
      try {
        rows.push(JSON.parse(ln));
      } catch (_e) {
        /** skip corrupt — expanded log should stay loadable */
      }
    });
    return rows;
  } catch (_e) {
    return [];
  }
}

function inRange(tsIso, fromIso, toIso) {
  try {
    const t = new Date(String(tsIso || "")).getTime();
    if (!Number.isFinite(t)) return true;
    if (fromIso) {
      const f = new Date(String(fromIso)).getTime();
      if (Number.isFinite(f) && t < f) return false;
    }
    if (toIso) {
      const x = new Date(String(toIso)).getTime();
      if (Number.isFinite(x) && t > x) return false;
    }
    return true;
  } catch (_e) {
    return true;
  }
}

/**
 * @param {{
 *   type?: string,
 *   customerId?: string,
 *   taskId?: string,
 *   orderId?: string,
 *   fromIso?: string,
 *   toIso?: string,
 *   limit?: number,
 * }} filters
 */
function query(filters) {
  try {
    const f = filters && typeof filters === "object" ? filters : {};
    const lim = Math.min(500, Math.max(1, Number(f.limit) || 100));
    const type = f.type ? String(f.type) : "";
    const customerId = f.customerId != null ? String(f.customerId) : "";
    const taskId = f.taskId != null ? String(f.taskId) : "";
    const orderId = f.orderId != null ? String(f.orderId) : "";

    let pool = parseLines();

    pool = pool.filter((r) => {
      try {
        if (!r || typeof r !== "object") return false;
        if (type && String(r.type || "") !== type) return false;
        if (customerId && String(r.customerId || "") !== customerId) return false;
        if (taskId && String(r.taskId || "") !== taskId) return false;
        if (orderId && String(r.orderId || "") !== orderId) return false;
        const ts = r.emittedAt || r.timestamp || r.ts;
        if (!inRange(ts, f.fromIso, f.toIso)) return false;
        return true;
      } catch (_e) {
        return false;
      }
    });

    const tail = pool.slice(-lim);
    return { success: true, count: tail.length, events: tail };
  } catch (_e) {
    return { success: false, count: 0, events: [] };
  }
}

module.exports = {
  query,
  parseLines,
};
