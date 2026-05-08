"use strict";

/**
 * Operational friction log — JSON array on disk with corruption recovery & playbook insight rolls.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");

const FILENAME = "friction-log.json";
const PLAYBOOK_AREA = "Playbook Insight";

function frictionPath() {
  return path.join(taskQueue.DATA_DIR, FILENAME);
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_e) {}
  return `fr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function ensureFile() {
  taskQueue.ensureDirAndFiles();
  const p = frictionPath();
  if (!fs.existsSync(p)) {
    const seed = [];
    fs.writeFileSync(p, JSON.stringify(seed, null, 2), "utf8");
  }
}

/**
 * @returns {object[]}
 */
function readEntriesArray() {
  ensureFile();
  const p = frictionPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch (_e) {
    try {
      const bak = p + ".bak." + Date.now();
      if (fs.existsSync(p)) fs.copyFileSync(p, bak);
    } catch (_e2) {}
    const recovered = [];
    try {
      fs.writeFileSync(p, JSON.stringify(recovered, null, 2), "utf8");
    } catch (_e3) {}
    return recovered;
  }
}

function writeEntriesArray(arr) {
  const p = frictionPath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

/**
 * @param {object} payload
 */
function appendEntry(payload) {
  const rows = readEntriesArray();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    area: String(payload.area || "general").slice(0, 120),
    description: String(payload.description || "").slice(0, 2000),
    severity: String(payload.severity || "normal").slice(0, 48),
    whoNoticed: String(payload.whoNoticed || "operator").slice(0, 160),
    suggestedFix: payload.suggestedFix ? String(payload.suggestedFix).slice(0, 1000) : null,
    createdAt: now,
  };
  rows.push(row);

  const insight = {
    id: newId(),
    area: PLAYBOOK_AREA,
    description: `Auto summary: ${row.area} - ${row.severity} - ${String(row.description).slice(0, 180)}${row.description.length > 180 ? "..." : ""}`,
    severity: "insight",
    whoNoticed: "system",
    suggestedFix: row.suggestedFix,
    createdAt: now,
  };
  rows.push(insight);
  writeEntriesArray(rows);
  return { ok: true, entry: row, playbookInsight: insight };
}

/**
 * @param {number} limit
 */
function tailRecent(limit) {
  const rows = readEntriesArray();
  const n = Math.min(200, Math.max(1, Number(limit) || 40));
  return rows.slice(-n);
}

module.exports = {
  frictionPath,
  appendEntry,
  tailRecent,
  readEntriesArray,
  PLAYBOOK_AREA,
};
