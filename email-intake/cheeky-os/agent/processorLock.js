"use strict";

/**
 * File-backed processor lease — stale lock (>15 min without heartbeat) is reclaimable.
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("./taskQueue");

const LOCK_FILE = path.join(taskQueue.DATA_DIR, "processor-lock.json");

const STALE_MS = 15 * 60 * 1000;

function defaultLock() {
  return {
    isProcessing: false,
    taskId: null,
    startedAt: null,
    heartbeat: null,
  };
}

function readLock() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(LOCK_FILE)) return defaultLock();
    return Object.assign(defaultLock(), JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")));
  } catch (_e) {
    return defaultLock();
  }
}

function writeLock(payload) {
  try {
    taskQueue.ensureDirAndFiles();
    const next = Object.assign(defaultLock(), readLock(), payload);
    fs.writeFileSync(LOCK_FILE, JSON.stringify(next, null, 2), "utf8");
    return next;
  } catch (_e) {
    return defaultLock();
  }
}

function heartbeatAgeMs(lock) {
  try {
    if (!lock || !lock.heartbeat) return Infinity;
    const t = new Date(lock.heartbeat).getTime();
    if (!Number.isFinite(t)) return Infinity;
    return Date.now() - t;
  } catch (_e) {
    return Infinity;
  }
}

/**
 * Clears stale lease; returns true if lock is free or was stale-cleared.
 */
function ensureLockRecoverable() {
  try {
    const L = readLock();
    if (!L.isProcessing) return true;
    if (heartbeatAgeMs(L) > STALE_MS) {
      writeLock(defaultLock());
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Acquire exclusive lease for this PID (single worker). Caller must heartbeat + release.
 * @returns {boolean}
 */
function tryAcquireLease(taskIdMaybe) {
  try {
    if (!ensureLockRecoverable()) return false;
    const L = readLock();
    if (L.isProcessing && heartbeatAgeMs(L) <= STALE_MS) return false;
    const now = new Date().toISOString();
    writeLock({
      isProcessing: true,
      taskId: taskIdMaybe != null ? String(taskIdMaybe) : null,
      startedAt: now,
      heartbeat: now,
    });
    return true;
  } catch (_e) {
    return false;
  }
}

function touchHeartbeat(extra) {
  try {
    const now = new Date().toISOString();
    writeLock(Object.assign({ heartbeat: now }, extra || {}));
  } catch (_e) {}
}

function releaseLease() {
  try {
    writeLock(defaultLock());
  } catch (_e) {}
}

module.exports = {
  LOCK_FILE,
  readLock,
  tryAcquireLease,
  touchHeartbeat,
  releaseLease,
  ensureLockRecoverable,
  STALE_MS,
  heartbeatAgeMs,
};
