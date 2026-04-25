/**
 * File-backed PO registry (sendStatus, shipTo, timestamps). Merged with planner output.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "purchase-orders.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ orders: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readStore() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return Array.isArray(doc.orders) ? doc.orders : [];
  } catch (_e) {
    return [];
  }
}

function writeStore(orders) {
  ensureFile();
  fs.writeFileSync(STORE, JSON.stringify({ orders }, null, 2), "utf8");
}

function mergePoRecord(fresh, existing) {
  const ex = existing || {};
  const now = new Date().toISOString();
  return {
    poNumber: fresh.poNumber,
    supplier: fresh.supplier,
    items: fresh.items,
    totalUnits: fresh.totalUnits,
    linkedJobs: fresh.linkedJobs || [],
    notes: fresh.notes || "",
    sendStatus: ex.sendStatus || "DRAFT",
    shipTo: ex.shipTo != null ? ex.shipTo : null,
    createdAt: ex.createdAt || now,
    updatedAt: now,
    lastError: ex.lastError || null,
    messageId: ex.messageId || null,
    isDemo: Boolean(fresh.isDemo ?? ex.isDemo),
  };
}

function syncPurchaseOrdersFromPlan(orders) {
  const list = readStore();
  const byPo = new Map(list.map((o) => [o.poNumber, o]));
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || !o.poNumber) continue;
    const merged = mergePoRecord(o, byPo.get(o.poNumber));
    byPo.set(o.poNumber, merged);
  }
  writeStore(Array.from(byPo.values()));
  return Array.from(byPo.values());
}

function getPurchaseOrder(poNumber) {
  const p = String(poNumber || "").trim();
  return readStore().find((o) => o.poNumber === p) || null;
}

function getAllPurchaseOrders() {
  return readStore();
}

function updatePurchaseOrder(poNumber, updates) {
  const list = readStore();
  const idx = list.findIndex((o) => o.poNumber === String(poNumber || "").trim());
  if (idx < 0) return null;
  const now = new Date().toISOString();
  list[idx] = { ...list[idx], ...updates, poNumber: list[idx].poNumber, updatedAt: now };
  writeStore(list);
  return list[idx];
}

function removePurchaseOrdersIf(pred) {
  const list = readStore();
  const next = list.filter((o) => !pred(o));
  if (next.length === list.length) return 0;
  writeStore(next);
  return list.length - next.length;
}

module.exports = {
  syncPurchaseOrdersFromPlan,
  getPurchaseOrder,
  getAllPurchaseOrders,
  updatePurchaseOrder,
  removePurchaseOrdersIf,
};
