"use strict";

/**
 * Local Square action drafts — JSON persistence only (no Prisma migration).
 * Never sends or charges; tracks approval before optional Square draft creation.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "square-action-drafts.json");

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadRaw() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.entries)) return { entries: [] };
    return j;
  } catch {
    return { entries: [] };
  }
}

function saveRaw(data) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function generateId() {
  return "sqd_" + crypto.randomBytes(12).toString("hex");
}

function normalizeType(t) {
  const u = String(t || "").toUpperCase();
  if (["ESTIMATE", "INVOICE", "DEPOSIT_REQUEST", "BALANCE_DUE"].includes(u)) return u;
  return null;
}

function isActiveOpen(e) {
  const st = String(e.status || "").toUpperCase();
  return st === "DRAFT" || st === "APPROVED";
}

/**
 * @returns {{ entries: object[] }}
 */
function listAll() {
  return loadRaw();
}

/**
 * Count by status prefix groups for operator status.
 */
function getCounts() {
  const { entries } = loadRaw();
  const out = { drafts: 0, approved: 0, created: 0, errors: 0 };
  for (const e of entries) {
    const st = String(e.status || "").toUpperCase();
    if (st === "DRAFT") out.drafts += 1;
    else if (st === "APPROVED") out.approved += 1;
    else if (st === "CREATED" || st === "SENT") out.created += 1;
    else if (st === "ERROR") out.errors += 1;
  }
  return out;
}

/**
 * Idempotent: same orderId + type with open DRAFT/APPROVED returns existing.
 * @param {object} payload
 */
function upsertDraft(payload) {
  const type = normalizeType(payload.type);
  if (!type) throw new Error("invalid_type");

  const orderId = payload.orderId != null ? String(payload.orderId).trim() || null : null;
  const customerId = payload.customerId != null ? String(payload.customerId).trim() || null : null;
  const amount = Number(payload.amount) || 0;
  const depositAmount = Number(payload.depositAmount) || 0;
  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const notes = payload.notes != null ? String(payload.notes).slice(0, 4000) : "";

  const data = loadRaw();
  const now = new Date().toISOString();

  if (orderId) {
    const existing = data.entries.find(
      (e) =>
        String(e.orderId || "") === orderId &&
        String(e.type || "").toUpperCase() === type &&
        isActiveOpen(e)
    );
    if (existing) {
      existing.updatedAt = now;
      if (notes) existing.notes = notes;
      if (lineItems.length) existing.lineItemsJson = JSON.stringify(lineItems);
      if (amount > 0) existing.amount = amount;
      if (depositAmount > 0) existing.depositAmount = depositAmount;
      saveRaw(data);
      return { draft: existing, created: false, idempotent: true };
    }
  }

  const title =
    type === "INVOICE"
      ? "Invoice draft"
      : type === "ESTIMATE"
        ? "Estimate draft"
        : type === "DEPOSIT_REQUEST"
          ? "Deposit request"
          : "Balance due";

  const draft = {
    id: generateId(),
    orderId,
    customerId,
    type,
    status: "DRAFT",
    title,
    amount,
    depositAmount,
    lineItemsJson: JSON.stringify(lineItems),
    notes,
    squareDraftId: null,
    createdAt: now,
    updatedAt: now,
  };

  data.entries.push(draft);
  saveRaw(data);
  return { draft, created: true, idempotent: false };
}

function getById(id) {
  const want = String(id || "").trim();
  if (!want) return null;
  const { entries } = loadRaw();
  return entries.find((e) => String(e.id) === want) || null;
}

function setStatus(id, status) {
  const st = String(status || "").toUpperCase();
  if (!["DRAFT", "APPROVED", "CREATED", "SENT", "CANCELED", "ERROR"].includes(st)) {
    throw new Error("invalid_status");
  }
  const data = loadRaw();
  const e = data.entries.find((x) => String(x.id) === String(id));
  if (!e) return null;
  e.status = st;
  e.updatedAt = new Date().toISOString();
  saveRaw(data);
  return e;
}

function setSquareDraftId(id, squareDraftId, extra) {
  const data = loadRaw();
  const e = data.entries.find((x) => String(x.id) === String(id));
  if (!e) return null;
  if (squareDraftId && String(squareDraftId).trim()) {
    e.squareDraftId = String(squareDraftId).trim();
  }
  e.status = "CREATED";
  e.updatedAt = new Date().toISOString();
  if (extra && typeof extra === "object") {
    if (extra.squareOrderId) e.squareOrderId = String(extra.squareOrderId);
    if (extra.localEstimateId) e.localEstimateId = String(extra.localEstimateId);
    if (extra.notesAppend) e.notes = (e.notes || "") + "\n" + String(extra.notesAppend);
  }
  saveRaw(data);
  return e;
}

function setError(id, message) {
  const data = loadRaw();
  const e = data.entries.find((x) => String(x.id) === String(id));
  if (!e) return null;
  e.status = "ERROR";
  e.notes = (e.notes || "") + "\nERROR: " + String(message || "").slice(0, 2000);
  e.updatedAt = new Date().toISOString();
  saveRaw(data);
  return e;
}

module.exports = {
  DATA_FILE,
  listAll,
  getCounts,
  upsertDraft,
  getById,
  setStatus,
  setSquareDraftId,
  setError,
  normalizeType,
};
