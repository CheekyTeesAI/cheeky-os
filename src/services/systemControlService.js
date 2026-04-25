/**
 * Kill switch + safe mode — integrates with automation pause.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "system-control.json");

const UNSTABLE_THRESHOLD = Number(process.env.CHEEKY_SAFE_MODE_THRESHOLD || 5);

function readState() {
  try {
    if (!fs.existsSync(FILE)) {
      return {
        paused: false,
        pausedBy: null,
        safeMode: false,
        safeModeReason: null,
        unstableHits: 0,
        updatedAt: null,
        locked: false,
        lockedBy: null,
      };
    }
    return { ...JSON.parse(fs.readFileSync(FILE, "utf8") || "{}") };
  } catch (_e) {
    return {
      paused: false,
      pausedBy: null,
      safeMode: false,
      safeModeReason: null,
      unstableHits: 0,
      updatedAt: null,
      locked: false,
      lockedBy: null,
    };
  }
}

function writeState(s) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2), "utf8");
  } catch (_e) {
    /* ignore */
  }
}

function syncAutomationPause(paused) {
  try {
    const { setAutomationPaused } = require("./automationRunner");
    setAutomationPaused(!!paused);
  } catch (_e) {
    /* optional */
  }
}

function pauseSystem(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const st = readState();
  st.paused = true;
  st.pausedBy = o.userId != null ? String(o.userId) : "system";
  st.updatedAt = new Date().toISOString();
  writeState(st);
  syncAutomationPause(true);
  return getSystemState();
}

function resumeSystem(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const st = readState();
  st.paused = false;
  st.pausedBy = null;
  st.updatedAt = new Date().toISOString();
  writeState(st);
  syncAutomationPause(false);
  return getSystemState();
}

function lockSystem(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const st = readState();
  st.locked = true;
  st.lockedBy = o.userId != null ? String(o.userId) : "system";
  st.paused = true;
  st.pausedBy = st.lockedBy;
  st.updatedAt = new Date().toISOString();
  writeState(st);
  syncAutomationPause(true);
  return getSystemState();
}

function unlockSystem(opts) {
  const st = readState();
  st.locked = false;
  st.lockedBy = null;
  st.paused = false;
  st.pausedBy = null;
  st.updatedAt = new Date().toISOString();
  writeState(st);
  syncAutomationPause(false);
  return getSystemState();
}

function enterSafeMode(reason) {
  const st = readState();
  st.safeMode = true;
  st.safeModeReason = String(reason || "health_critical").slice(0, 500);
  st.updatedAt = new Date().toISOString();
  writeState(st);
  return getSystemState();
}

function exitSafeMode() {
  const st = readState();
  st.safeMode = false;
  st.safeModeReason = null;
  st.unstableHits = 0;
  st.updatedAt = new Date().toISOString();
  writeState(st);
  return getSystemState();
}

/**
 * Call with statusEngine health string e.g. CRITICAL → safe mode after threshold.
 */
function noteHealthStatus(health) {
  const h = String(health || "").toUpperCase();
  const st = readState();
  if (h === "CRITICAL" || h === "RED") {
    st.unstableHits = (Number(st.unstableHits) || 0) + 1;
    if (st.unstableHits >= UNSTABLE_THRESHOLD && !st.safeMode) {
      st.safeMode = true;
      st.safeModeReason = "automatic_safe_mode_unstable_health";
      st.updatedAt = new Date().toISOString();
      writeState(st);
    } else {
      writeState(st);
    }
  } else if (h === "OK" || h === "DEGRADED") {
    st.unstableHits = 0;
    writeState(st);
  }
}

function getSystemState() {
  const st = readState();
  return {
    running: !st.paused,
    paused: !!st.paused,
    pausedBy: st.pausedBy || null,
    locked: !!st.locked,
    lockedBy: st.lockedBy || null,
    safeMode: !!st.safeMode,
    safeModeReason: st.safeModeReason || null,
    unstableHits: st.unstableHits || 0,
    timestamp: st.updatedAt || new Date().toISOString(),
  };
}

function shouldBlockOutbound() {
  const st = readState();
  return !!st.paused || !!st.safeMode;
}

function shouldBlockFinancialWrites() {
  const st = readState();
  return !!st.safeMode || !!st.paused;
}

module.exports = {
  pauseSystem,
  resumeSystem,
  lockSystem,
  unlockSystem,
  enterSafeMode,
  exitSafeMode,
  getSystemState,
  readState,
  noteHealthStatus,
  shouldBlockOutbound,
  shouldBlockFinancialWrites,
};
