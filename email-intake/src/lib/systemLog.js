/**
 * Append-only system log (CommonJS) — JSON lines under outputs/.
 */
const fs = require("fs");
const path = require("path");

const baseDir = path.join(__dirname, "..", "..");
const logPath = path.join(baseDir, "outputs", "system-log.jsonl");

function ensureDir() {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * @param {{ action: string, detail?: Record<string, unknown> }} entry
 */
function logAction(entry) {
  ensureDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    action: entry.action,
    detail: entry.detail || {},
  });
  fs.appendFileSync(logPath, line + "\n", "utf8");
}

module.exports = { logAction, logPath };
