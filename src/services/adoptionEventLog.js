/**
 * Append-only adoption events — does not replace foundation/ops logs.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "adoption-events.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      fs.writeFileSync(FILE, JSON.stringify({ version: 1, events: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
function logAdoptionEvent(type, payload) {
  ensureFile();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(type || "UNKNOWN"),
    createdAt: new Date().toISOString(),
    payload: payload && typeof payload === "object" ? payload : {},
  };
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8") || "{}");
    const events = Array.isArray(raw.events) ? raw.events : [];
    events.push(entry);
    const trimmed = events.slice(-500);
    fs.writeFileSync(FILE, JSON.stringify({ version: 1, events: trimmed }, null, 2), "utf8");
  } catch (e) {
    console.warn("[adoptionEventLog]", type, e && e.message ? e.message : e);
  }
  return entry;
}

module.exports = { logAdoptionEvent };
