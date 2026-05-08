"use strict";

const fs = require("fs");
const path = require("path");
const taskQueue = require("../agent/taskQueue");

function filePath() {
  return path.join(taskQueue.DATA_DIR, "work-order-drafts.jsonl");
}

function append(draft) {
  taskQueue.ensureDirAndFiles();
  fs.appendFileSync(filePath(), `${JSON.stringify(draft)}\n`, "utf8");
  return { ok: true };
}

function getById(id) {
  taskQueue.ensureDirAndFiles();
  const p = filePath();
  if (!fs.existsSync(p)) return null;
  const want = String(id || "").trim();
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o && String(o.id) === want) return o;
    } catch (_e) {}
  }
  return null;
}

function listRecent(limit) {
  taskQueue.ensureDirAndFiles();
  const p = filePath();
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
  const n = Math.min(400, Math.max(1, Number(limit) || 150));
  /** @type {object[]} */
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
    try {
      out.push(JSON.parse(lines[i]));
    } catch (_e) {}
  }
  return out;
}

module.exports = {
  append,
  getById,
  listRecent,
};
