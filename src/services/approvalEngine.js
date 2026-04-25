/**
 * Lightweight approval queue (memory + optional file mirror).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "pending-approvals.json");

const pending = new Map();

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_e) {
    /* ignore */
  }
}

function loadDisk() {
  ensureFile();
  try {
    if (!fs.existsSync(STORE)) return;
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    const rows = Array.isArray(doc.approvals) ? doc.approvals : [];
    for (const r of rows) {
      if (r && r.id && r.status === "PENDING") pending.set(r.id, r);
    }
  } catch (_e) {
    /* ignore */
  }
}

function persist() {
  ensureFile();
  try {
    const approvals = Array.from(pending.values());
    fs.writeFileSync(STORE, JSON.stringify({ approvals }, null, 2), "utf8");
  } catch (_e) {
    /* ignore */
  }
}

loadDisk();

function genId() {
  return `APR-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * @param {string} actionType
 * @param {object} payload
 */
function requireApproval(actionType, payload) {
  const type = String(actionType || "ACTION");
  const poNumber = payload && payload.poNumber ? String(payload.poNumber) : "";
  for (const [id, row] of pending.entries()) {
    if (row.status === "PENDING" && row.type === type && poNumber && row.payload && row.payload.poNumber === poNumber) {
      pending.delete(id);
    }
  }
  const id = genId();
  const entry = {
    id,
    type,
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: new Date().toISOString(),
    status: "PENDING",
  };
  pending.set(id, entry);
  persist();
  return entry;
}

function getApproval(approvalId) {
  const id = String(approvalId || "").trim();
  return pending.get(id) || null;
}

/**
 * @param {string} approvalToken
 */
function approveAction(approvalToken) {
  const id = String(approvalToken || "").trim();
  const row = pending.get(id);
  if (!row || row.status !== "PENDING") {
    return { ok: false, error: "approval_not_found_or_used", entry: null };
  }
  row.status = "APPROVED";
  row.approvedAt = new Date().toISOString();
  persist();
  return { ok: true, error: null, entry: row };
}

function listPendingApprovals() {
  return Array.from(pending.values()).filter((r) => r.status === "PENDING");
}

module.exports = {
  requireApproval,
  approveAction,
  listPendingApprovals,
  getApproval,
};
