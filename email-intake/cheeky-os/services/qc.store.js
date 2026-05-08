"use strict";

/**
 * QC + reprint ledger (JSON). Defect history append-only — records are never deleted.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "qc.json");

const VALID_CHECK_STATUS = new Set(["PENDING", "PASS", "FAIL", "OVERRIDE_PASS"]);
const VALID_DEFECT_TYPES = new Set([
  "PRINT_QUALITY",
  "COLOR",
  "ALIGNMENT",
  "PRESS_ISSUE",
  "GARMENT_DEFECT",
  "OTHER",
]);
const VALID_SEVERITY = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultData() {
  return { checks: [], reprintPlans: [], version: 1 };
}

function loadRaw() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return defaultData();
    return {
      checks: Array.isArray(j.checks) ? j.checks : [],
      reprintPlans: Array.isArray(j.reprintPlans) ? j.reprintPlans : [],
      version: typeof j.version === "number" ? j.version : 1,
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

function listChecks() {
  return loadRaw().checks || [];
}

function listReprintPlans() {
  return loadRaw().reprintPlans || [];
}

function findCheckById(id) {
  const pid = String(id || "").trim();
  return listChecks().find((c) => c.id === pid) || null;
}

/** Open PENDING check for order (at most one). */
function findOpenPendingForOrder(orderId) {
  const oid = String(orderId || "").trim();
  return listChecks().find((c) => c.orderId === oid && String(c.status || "").toUpperCase() === "PENDING") || null;
}

/** Latest check by createdAt for order */
function getLatestCheckForOrder(orderId) {
  const oid = String(orderId || "").trim();
  const rows = listChecks().filter((c) => c.orderId === oid);
  if (!rows.length) return null;
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function hasAnyCheckForOrder(orderId) {
  const oid = String(orderId || "").trim();
  return listChecks().some((c) => c.orderId === oid);
}

function appendCheck(check) {
  const data = loadRaw();
  data.checks.push(check);
  saveRaw(data);
  return check;
}

function updateCheck(check) {
  const data = loadRaw();
  const i = data.checks.findIndex((c) => c.id === check.id);
  if (i < 0) return null;
  data.checks[i] = check;
  saveRaw(data);
  return check;
}

/** OPEN reprint plan for order (not RESOLVED). */
function findOpenReprintPlan(orderId) {
  const oid = String(orderId || "").trim();
  return (
    listReprintPlans().find((p) => {
      if (p.orderId !== oid) return false;
      const s = String(p.status || "").toUpperCase();
      return s === "OPEN";
    }) || null
  );
}

function saveReprintPlan(plan) {
  const data = loadRaw();
  const i = data.reprintPlans.findIndex((p) => p.id === plan.id);
  if (i >= 0) data.reprintPlans[i] = plan;
  else data.reprintPlans.push(plan);
  saveRaw(data);
  return plan;
}

function resolveReprintPlansForOrder(orderId, reason) {
  const oid = String(orderId || "").trim();
  const data = loadRaw();
  const now = new Date().toISOString();
  for (const p of data.reprintPlans) {
    if (p.orderId !== oid) continue;
    if (String(p.status || "").toUpperCase() !== "OPEN") continue;
    p.status = "RESOLVED";
    p.needsReprint = false;
    p.productionBlocked = false;
    p.resolvedAt = now;
    p.resolveNote = String(reason || "qc_pass_or_complete").slice(0, 2000);
    p.updatedAt = now;
  }
  saveRaw(data);
}

module.exports = {
  DATA_FILE,
  loadRaw,
  saveRaw,
  newId,
  listChecks,
  listReprintPlans,
  findCheckById,
  findOpenPendingForOrder,
  getLatestCheckForOrder,
  hasAnyCheckForOrder,
  appendCheck,
  updateCheck,
  findOpenReprintPlan,
  saveReprintPlan,
  resolveReprintPlansForOrder,
  VALID_CHECK_STATUS,
  VALID_DEFECT_TYPES,
  VALID_SEVERITY,
};
