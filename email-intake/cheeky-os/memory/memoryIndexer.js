"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const taskMemory = require("./taskMemory");

const INDEX_FILE = path.join(taskQueue.DATA_DIR, "task-memory-index.json");

function emptyIndex() {
  return {
    byTargetSlug: {},
    byTag: {},
    byOutcome: { completed: [], failed: [], rejected: [], unknown: [] },
    memoryIdsOrdered: [],
    byIntent: {},
    semanticV31: { version: 1, updatedAt: null },
  };
}

function readIndexSafe() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(INDEX_FILE)) return emptyIndex();
    const j = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    return Object.assign(emptyIndex(), j || {});
  } catch (_e) {
    return emptyIndex();
  }
}

function writeIndex(idx) {
  try {
    taskQueue.ensureDirAndFiles();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2), "utf8");
  } catch (_e) {}
}

function slug(s) {
  try {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 64)
      .replace(/^-+|-+$/g, "");
  } catch (_e) {
    return "";
  }
}

function indexOne(row) {
  try {
    const idx = readIndexSafe();
    const mid = row.memoryId || row.taskId || String(Date.now());
    if (!idx.memoryIdsOrdered.includes(mid)) idx.memoryIdsOrdered.push(mid);

    const tslug = slug(row.targetKey || row.category || row.summary || "task") || slug(row.category);
    idx.byTargetSlug[tslug] = idx.byTargetSlug[tslug] || [];
    if (!idx.byTargetSlug[tslug].includes(mid)) idx.byTargetSlug[tslug].push(mid);

    (Array.isArray(row.tags) ? row.tags : []).forEach((t) => {
      const k = slug(t);
      if (!k) return;
      idx.byTag[k] = idx.byTag[k] || [];
      if (!idx.byTag[k].includes(mid)) idx.byTag[k].push(mid);
    });

    const oc = slug(row.outcome || "unknown");
    const bucket = oc === "completed" ? "completed" : oc === "failed" ? "failed" : oc === "rejected" ? "rejected" : "unknown";
    if (!idx.byOutcome[bucket].includes(mid)) idx.byOutcome[bucket].push(mid);

    const islug = slug(row.category || row.intent || "");
    if (islug && mid) {
      idx.byIntent[islug] = idx.byIntent[islug] || [];
      if (!idx.byIntent[islug].includes(mid)) idx.byIntent[islug].push(mid);
    }

    idx.semanticV31 = Object.assign({}, idx.semanticV31 || {}, {
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    writeIndex(idx);
  } catch (_e) {}
}

function rebuildFromDisk() {
  try {
    const fresh = emptyIndex();
    const all = taskMemory.loadAllSync();
    for (let i = 0; i < all.length; i++) {
      const mid = all[i].memoryId;
      fresh.memoryIdsOrdered.push(mid);
      const row = all[i];
      const tslug = slug(row.targetKey || row.category || row.summary || "");
      if (mid) {
        fresh.byTargetSlug[tslug] = fresh.byTargetSlug[tslug] || [];
        if (!fresh.byTargetSlug[tslug].includes(mid)) fresh.byTargetSlug[tslug].push(mid);
      }
      (Array.isArray(row.tags) ? row.tags : []).forEach((t) => {
        const k = slug(t);
        if (!k || !mid) return;
        fresh.byTag[k] = fresh.byTag[k] || [];
        if (!fresh.byTag[k].includes(mid)) fresh.byTag[k].push(mid);
      });
      const oc = String(row.outcome || "unknown");
      const bucket =
        oc === "completed" ? "completed" : oc === "failed" ? "failed" : oc === "rejected" ? "rejected" : "unknown";
      if (mid && !fresh.byOutcome[bucket].includes(mid)) fresh.byOutcome[bucket].push(mid);
      const islug = slug(row.category || row.intent || "");
      if (islug && mid) {
        fresh.byIntent[islug] = fresh.byIntent[islug] || [];
        if (!fresh.byIntent[islug].includes(mid)) fresh.byIntent[islug].push(mid);
      }
    }

    fresh.semanticV31 = Object.assign({}, fresh.semanticV31 || {}, { version: 1, rebuiltAt: new Date().toISOString() });

    writeIndex(fresh);
    return { ok: true, count: all.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  INDEX_FILE,
  emptyIndex,
  readIndexSafe,
  indexOne,
  rebuildFromDisk,
};
