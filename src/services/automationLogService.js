/**
 * Append-only automation cycle log (ring buffer).
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_FILE = path.join(DATA_DIR, "automation-cycle-log.json");
const MAX_ENTRIES = 100;

function readLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return { entries: [] };
    const doc = JSON.parse(fs.readFileSync(LOG_FILE, "utf8") || "{}");
    return Array.isArray(doc.entries) ? doc : { entries: [] };
  } catch (_e) {
    return { entries: [] };
  }
}

function writeLog(doc) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(doc, null, 2), "utf8");
  } catch (_e) {
    /* ignore */
  }
}

/**
 * @param {{ actionsRun?: string[], successes?: number, failures?: number, warnings?: string[], mock?: boolean, detail?: object }} cycle
 */
function appendAutomationLog(cycle) {
  const c = cycle && typeof cycle === "object" ? cycle : {};
  const entry = {
    timestamp: new Date().toISOString(),
    actionsRun: Array.isArray(c.actionsRun) ? c.actionsRun : [],
    successes: Number(c.successes) || 0,
    failures: Number(c.failures) || 0,
    warnings: Array.isArray(c.warnings) ? c.warnings : [],
    mock: Boolean(c.mock),
    detail: c.detail && typeof c.detail === "object" ? c.detail : undefined,
  };
  const doc = readLog();
  doc.entries.push(entry);
  if (doc.entries.length > MAX_ENTRIES) {
    doc.entries = doc.entries.slice(-MAX_ENTRIES);
  }
  writeLog(doc);
  return entry;
}

function getRecentLogs(limit) {
  const doc = readLog();
  const n = Math.min(50, Math.max(1, Number(limit) || 20));
  return doc.entries.slice(-n).reverse();
}

module.exports = {
  appendAutomationLog,
  getRecentLogs,
};
