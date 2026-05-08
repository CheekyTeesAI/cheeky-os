"use strict";

/**
 * Purchasing ledger (JSON). Advisory / staging only — no vendor API calls.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "purchasing.json");

const VALID_PLAN_STATUS = new Set([
  "DRAFT",
  "NEEDS_APPROVAL",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "BLOCKED",
  "CANCELED",
]);

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultData() {
  return {
    vendors: [],
    plans: [],
  };
}

function loadRaw() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return defaultData();
    return {
      vendors: Array.isArray(j.vendors) ? j.vendors : [],
      plans: Array.isArray(j.plans) ? j.plans : [],
    };
  } catch (_e) {
    return defaultData();
  }
}

function saveRaw(data) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** Skip duplicate only for in-flight pipeline statuses (not BLOCKED — owner may fix gates and rebuild). */
const OPEN_PIPELINE_STATUSES = new Set([
  "DRAFT",
  "NEEDS_APPROVAL",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
]);

function findActivePlanForOrder(orderId) {
  const data = loadRaw();
  const oid = String(orderId || "").trim();
  return (data.plans || []).find((p) => {
    const st = String(p.status || "").toUpperCase();
    return p.orderId === oid && OPEN_PIPELINE_STATUSES.has(st);
  });
}

function findPlanById(id) {
  const data = loadRaw();
  const pid = String(id || "").trim();
  return (data.plans || []).find((p) => p.id === pid) || null;
}

function listPlans() {
  return loadRaw().plans || [];
}

function listVendors() {
  return loadRaw().vendors || [];
}

function upsertVendor(body) {
  const data = loadRaw();
  const now = new Date().toISOString();
  const id = String(body.id || "").trim() || newId("ven");
  const idx = data.vendors.findIndex((v) => v.id === id);
  const row = {
    id,
    name: String(body.name || "").trim().slice(0, 200),
    type: String(body.type || "BLANK_SUPPLIER").slice(0, 80),
    contactName: body.contactName != null ? String(body.contactName).slice(0, 200) : "",
    email: body.email != null ? String(body.email).slice(0, 200) : "",
    phone: body.phone != null ? String(body.phone).slice(0, 80) : "",
    website: body.website != null ? String(body.website).slice(0, 300) : "",
    notes: body.notes != null ? String(body.notes).slice(0, 2000) : "",
    active: body.active !== false,
    createdAt: idx >= 0 ? data.vendors[idx].createdAt : now,
    updatedAt: now,
  };
  if (idx >= 0) data.vendors[idx] = row;
  else data.vendors.push(row);
  saveRaw(data);
  return row;
}

function savePlan(plan) {
  const data = loadRaw();
  const i = data.plans.findIndex((p) => p.id === plan.id);
  if (i >= 0) data.plans[i] = plan;
  else data.plans.push(plan);
  saveRaw(data);
  return plan;
}

function metrics() {
  const plans = listPlans();
  const m = {
    draft: 0,
    needsApproval: 0,
    approved: 0,
    ordered: 0,
    blocked: 0,
    received: 0,
    canceled: 0,
    partiallyReceived: 0,
  };
  for (const p of plans) {
    const s = String(p.status || "").toUpperCase();
    if (s === "DRAFT") m.draft += 1;
    else if (s === "NEEDS_APPROVAL") m.needsApproval += 1;
    else if (s === "APPROVED") m.approved += 1;
    else if (s === "ORDERED") m.ordered += 1;
    else if (s === "BLOCKED") m.blocked += 1;
    else if (s === "RECEIVED") m.received += 1;
    else if (s === "CANCELED") m.canceled += 1;
    else if (s === "PARTIALLY_RECEIVED") m.partiallyReceived += 1;
  }
  return m;
}

module.exports = {
  DATA_FILE,
  loadRaw,
  saveRaw,
  listPlans,
  listVendors,
  findActivePlanForOrder,
  findPlanById,
  upsertVendor,
  savePlan,
  metrics,
  VALID_PLAN_STATUS,
  newId,
};
