/**
 * Append-only audit trail for critical actions.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "audit-log.json");
const MAX = 800;

function readDoc() {
  try {
    if (!fs.existsSync(FILE)) return { entries: [] };
    const d = JSON.parse(fs.readFileSync(FILE, "utf8") || "{}");
    return Array.isArray(d.entries) ? d : { entries: [] };
  } catch (_e) {
    return { entries: [] };
  }
}

function writeDoc(doc) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(doc, null, 2), "utf8");
  } catch (_e) {
    /* ignore */
  }
}

/**
 * @param {{ userId?: string, action: string, endpoint?: string, payload?: object, result?: string, meta?: object }} row
 */
function appendAudit(row) {
  if (String(process.env.CHEEKY_AUDIT_ENABLED || "true").toLowerCase() === "false") return null;
  const r = row && typeof row === "object" ? row : {};
  const entry = {
    timestamp: new Date().toISOString(),
    userId: r.userId != null ? String(r.userId) : null,
    action: String(r.action || "UNKNOWN"),
    endpoint: r.endpoint != null ? String(r.endpoint) : null,
    payload: r.payload && typeof r.payload === "object" ? sanitizePayload(r.payload) : null,
    result: r.result != null ? String(r.result).slice(0, 2000) : null,
    meta: r.meta && typeof r.meta === "object" ? r.meta : undefined,
  };
  const doc = readDoc();
  doc.entries.push(entry);
  if (doc.entries.length > MAX) doc.entries = doc.entries.slice(-MAX);
  writeDoc(doc);
  return entry;
}

function sanitizePayload(p) {
  try {
    const s = JSON.stringify(p);
    return JSON.parse(s.length > 4000 ? s.slice(0, 4000) + "…" : s);
  } catch (_e) {
    return { note: "unserializable" };
  }
}

function getRecentAudit(limit) {
  const doc = readDoc();
  const n = Math.min(100, Math.max(1, Number(limit) || 25));
  return doc.entries.slice(-n).reverse();
}

function searchAuditByAction(actionFragment) {
  const q = String(actionFragment || "").toLowerCase();
  const doc = readDoc();
  return doc.entries
    .filter((e) => e && String(e.action || "").toLowerCase().includes(q))
    .slice(-20)
    .reverse();
}

module.exports = {
  appendAudit,
  getRecentAudit,
  searchAuditByAction,
};
