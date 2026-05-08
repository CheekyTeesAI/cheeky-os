"use strict";

/**
 * Local JSON cashflow ledger (cents). No bank actions — advisory only.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "cashflow.json");

const VALID_OBLIGATION_STATUS = new Set([
  "UPCOMING",
  "DUE_SOON",
  "DUE_TODAY",
  "OVERDUE",
  "PAID",
  "DEFERRED",
  "WATCH",
]);
const VALID_PRIORITY = new Set(["CRITICAL", "HIGH", "NORMAL", "LOW"]);
const VALID_EVENT_TYPES = new Set([
  "EXPECTED_INCOME",
  "BILL",
  "DEBT_PAYMENT",
  "TAX",
  "VENDOR_PAYMENT",
  "PAYROLL",
  "OWNER_DRAW",
  "OTHER",
]);
const VALID_EVENT_STATUS = new Set(["UPCOMING", "RECEIVED", "CANCELLED", "DEFERRED"]);

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadRaw() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return defaultData();
    return {
      cashAccounts: Array.isArray(j.cashAccounts) ? j.cashAccounts : [],
      obligations: Array.isArray(j.obligations) ? j.obligations : [],
      debts: Array.isArray(j.debts) ? j.debts : [],
      events: Array.isArray(j.events) ? j.events : [],
    };
  } catch {
    return defaultData();
  }
}

function defaultData() {
  return { cashAccounts: [], obligations: [], debts: [], events: [] };
}

function saveRaw(data) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function nyYmd(d) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function newId(prefix) {
  const p = String(prefix || "id").replace(/[^a-z]/gi, "");
  return (
    p +
    "-" +
    (typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(10).toString("hex"))
  );
}

function daysFromYmd(a, b) {
  const ta = Date.parse(String(a) + "T12:00:00Z");
  const tb = Date.parse(String(b) + "T12:00:00Z");
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

/**
 * Derive display status from due date vs NY today (does not override PAID/DEFERRED).
 */
function deriveObligationStatus(row, todayYmd) {
  const st = String(row.status || "").toUpperCase();
  if (st === "PAID" || st === "DEFERRED") return st;
  const due = String(row.dueDate || "").slice(0, 10);
  if (!due || due.length < 8) return st === "WATCH" ? "WATCH" : "UPCOMING";
  const diff = daysFromYmd(todayYmd, due);
  if (diff == null) return "UPCOMING";
  if (diff < 0) return "OVERDUE";
  if (diff === 0) return "DUE_TODAY";
  if (diff <= 7) return "DUE_SOON";
  return "UPCOMING";
}

function listObligationsWithDerived() {
  const data = loadRaw();
  const todayYmd = nyYmd(new Date());
  return (data.obligations || []).map((r) => ({
    ...r,
    derivedStatus: deriveObligationStatus(r, todayYmd),
  }));
}

function listAll() {
  return loadRaw();
}

function findObligation(id) {
  const data = loadRaw();
  return (data.obligations || []).find((x) => x.id === id) || null;
}

function upsertCashAccount(patch) {
  const data = loadRaw();
  const id = String(patch.id || "").trim() || newId("acct");
  const now = new Date().toISOString();
  const row = {
    id,
    name: String(patch.name || "Operating").slice(0, 200),
    type: String(patch.type || "CHECKING").slice(0, 80),
    currentBalance: Math.round(Number(patch.currentBalance || 0)),
    notes: String(patch.notes || "").slice(0, 2000),
    updatedAt: now,
    createdAt: patch.createdAt || now,
  };
  const rest = data.cashAccounts.filter((x) => x.id !== id);
  rest.push(row);
  data.cashAccounts = rest;
  saveRaw(data);
  return row;
}

function addObligation(body) {
  const data = loadRaw();
  const todayYmd = nyYmd(new Date());
  const now = new Date().toISOString();
  const id = newId("obl");
  const dueDate = String(body.dueDate || "").slice(0, 10);
  const pr = String(body.priority || "NORMAL").toUpperCase();
  const priority = VALID_PRIORITY.has(pr) ? pr : "NORMAL";
  const row = {
    id,
    name: String(body.name || "").slice(0, 300),
    vendor: String(body.vendor || "").slice(0, 300),
    category: String(body.category || "OTHER").slice(0, 80),
    amount: Math.round(Number(body.amount || 0)),
    dueDate,
    status: deriveObligationStatus(
      { status: "UPCOMING", dueDate },
      todayYmd
    ),
    priority,
    autopay: !!body.autopay,
    notes: String(body.notes || "").slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  };
  data.obligations.push(row);
  saveRaw(data);
  return row;
}

function patchObligationStatus(id, body) {
  const data = loadRaw();
  const oid = String(id || "").trim();
  const i = (data.obligations || []).findIndex((x) => x.id === oid);
  if (i < 0) return null;
  const st = String(body.status || "").toUpperCase();
  if (!VALID_OBLIGATION_STATUS.has(st)) return { error: "invalid_status" };
  const note = body.note != null ? String(body.note).trim() : "";
  const prev = data.obligations[i].notes || "";
  data.obligations[i] = {
    ...data.obligations[i],
    status: st,
    notes: note ? [prev, "status:" + st + " " + note].filter(Boolean).join(" | ").slice(0, 4000) : prev,
    updatedAt: new Date().toISOString(),
  };
  saveRaw(data);
  return data.obligations[i];
}

function addEvent(body) {
  const data = loadRaw();
  const now = new Date().toISOString();
  const ty = String(body.type || "OTHER").toUpperCase();
  const type = VALID_EVENT_TYPES.has(ty) ? ty : "OTHER";
  const row = {
    id: newId("evt"),
    type,
    source: String(body.source || "").slice(0, 300),
    amount: Math.round(Number(body.amount || 0)),
    expectedDate: String(body.expectedDate || "").slice(0, 10),
    status: String(body.status || "UPCOMING").toUpperCase(),
    notes: String(body.notes || "").slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  };
  if (!VALID_EVENT_STATUS.has(row.status)) row.status = "UPCOMING";
  data.events.push(row);
  saveRaw(data);
  return row;
}

function addDebt(body) {
  const data = loadRaw();
  const now = new Date().toISOString();
  const row = {
    id: newId("debt"),
    name: String(body.name || "").slice(0, 300),
    lender: String(body.lender || "").slice(0, 300),
    balance: Math.round(Number(body.balance || 0)),
    minimumPayment: Math.round(Number(body.minimumPayment || 0)),
    dueDate: String(body.dueDate || "").slice(0, 10),
    apr: body.apr != null ? Number(body.apr) : null,
    status: String(body.status || "WATCH").toUpperCase(),
    priority: VALID_PRIORITY.has(String(body.priority || "").toUpperCase())
      ? String(body.priority || "").toUpperCase()
      : "HIGH",
    notes: String(body.notes || "").slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  };
  data.debts.push(row);
  saveRaw(data);
  return row;
}

module.exports = {
  DATA_FILE,
  loadRaw,
  saveRaw,
  nyYmd,
  listObligationsWithDerived,
  listAll,
  findObligation,
  upsertCashAccount,
  addObligation,
  patchObligationStatus,
  addEvent,
  addDebt,
  deriveObligationStatus,
  daysFromYmd,
  VALID_OBLIGATION_STATUS,
  VALID_PRIORITY,
  VALID_EVENT_TYPES,
};
