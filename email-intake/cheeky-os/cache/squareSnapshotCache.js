"use strict";

/**
 * Persist last known-good Square read snapshot — survives API/network loss.
 */

const fs = require("fs");
const path = require("path");
const taskQueue = require("../agent/taskQueue");

const SNAPSHOT_LABEL = "square-snapshot.json";

function snapshotPath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, SNAPSHOT_LABEL);
}

/**
 * Read snapshot with malformed-file recovery → empty scaffold.
 */
function readSnapshotDisk() {
  const p = snapshotPath();
  if (!fs.existsSync(p)) {
    const empty = { cachedAt: null, data: {}, version: 1 };
    try {
      fs.writeFileSync(p, JSON.stringify(empty, null, 2), "utf8");
    } catch (_e2) {}
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_e) {
    try {
      const bak = p + ".bak." + Date.now();
      if (fs.existsSync(p)) fs.copyFileSync(p, bak);
    } catch (_e2) {}
    const empty = {
      cachedAt: new Date().toISOString(),
      data: {},
      version: 1,
      recoveredFromCorruption: true,
    };
    try {
      fs.writeFileSync(p, JSON.stringify(empty, null, 2), "utf8");
    } catch (_e3) {}
    return empty;
  }
}

/** @param {{ cachedAt?: string, data?: object }} doc */
function writeSnapshotDisk(doc) {
  try {
    const p = snapshotPath();
    const next = Object.assign(readSnapshotDisk(), doc || {});
    next.cachedAt = next.cachedAt || new Date().toISOString();
    const tmp = `${p}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmp, p);
    return next;
  } catch (_e) {
    return readSnapshotDisk();
  }
}

module.exports = {
  readSnapshotDisk,
  writeSnapshotDisk,
};
