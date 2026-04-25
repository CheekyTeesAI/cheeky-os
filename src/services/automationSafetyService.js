/**
 * Safe execution gate for automation actions — dedupe, cooldown, missing data, risk.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const DEDUPE_FILE = path.join(DATA_DIR, "automation-dedupe.json");

const COOLDOWN_MS = {
  SQUARE_SYNC: Number(process.env.AUTOMATION_COOLDOWN_SQUARE_MS || 30 * 60 * 1000),
  FULL_CYCLE: Number(process.env.AUTOMATION_COOLDOWN_CYCLE_MS || 60 * 1000),
  DEFAULT: 15 * 1000,
};

function readDedupe() {
  try {
    if (!fs.existsSync(DEDUPE_FILE)) return { lastActionAt: {} };
    return JSON.parse(fs.readFileSync(DEDUPE_FILE, "utf8") || "{}");
  } catch (_e) {
    return { lastActionAt: {} };
  }
}

function writeDedupe(doc) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DEDUPE_FILE, JSON.stringify(doc, null, 2), "utf8");
  } catch (_e) {
    /* ignore */
  }
}

function nowMs() {
  return Date.now();
}

/**
 * @param {{ type: string, key?: string, dryRun?: boolean, hasRequiredData?: boolean, risk?: string }} action
 * @returns {{ allowed: boolean, reason: string }}
 */
function validateAutomationAction(action) {
  const a = action && typeof action === "object" ? action : {};
  const type = String(a.type || "UNKNOWN").toUpperCase();
  if (a.dryRun === true) {
    return { allowed: true, reason: "dry_run_simulated" };
  }
  if (a.hasRequiredData === false) {
    return { allowed: false, reason: "missing_required_data" };
  }
  if (String(a.risk || "").toUpperCase() === "HIGH" && a.explicitPolicy !== true) {
    return { allowed: false, reason: "high_risk_requires_policy" };
  }

  const doc = readDedupe();
  const lastMap = doc.lastActionAt && typeof doc.lastActionAt === "object" ? doc.lastActionAt : {};
  const key = `${type}:${a.key || "default"}`;
  const last = lastMap[key] ? Number(lastMap[key]) : 0;
  const cd =
    type === "SQUARE_SYNC"
      ? COOLDOWN_MS.SQUARE_SYNC
      : type === "FULL_CYCLE"
        ? COOLDOWN_MS.FULL_CYCLE
        : COOLDOWN_MS.DEFAULT;
  const elapsed = nowMs() - last;
  if (last > 0 && elapsed < cd && type !== "COMM_QUEUE") {
    return { allowed: false, reason: `cooldown_${Math.ceil((cd - elapsed) / 1000)}s` };
  }

  return { allowed: true, reason: "ok" };
}

function recordAction(action) {
  const a = action && typeof action === "object" ? action : {};
  if (a.dryRun === true) return;
  const type = String(a.type || "UNKNOWN").toUpperCase();
  const key = `${type}:${a.key || "default"}`;
  const doc = readDedupe();
  doc.lastActionAt = doc.lastActionAt && typeof doc.lastActionAt === "object" ? doc.lastActionAt : {};
  doc.lastActionAt[key] = nowMs();
  writeDedupe(doc);
}

module.exports = {
  validateAutomationAction,
  recordAction,
};
