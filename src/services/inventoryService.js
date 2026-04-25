/**
 * File-backed inventory (no Prisma table). Safe empty state when file missing.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "inventory.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ items: [], version: 1 }, null, 2), "utf8");
    }
  } catch (e) {
    console.warn("[inventoryService] ensureFile:", e && e.message ? e.message : e);
  }
}

function readStore() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return Array.isArray(doc.items) ? doc : { items: [], version: 1 };
  } catch (_e) {
    return { items: [], version: 1 };
  }
}

function writeStore(doc) {
  ensureFile();
  fs.writeFileSync(STORE, JSON.stringify(doc, null, 2), "utf8");
}

function normalizeItem(row) {
  const onHand = Math.max(0, Number(row.onHand) || 0);
  const allocated = Math.max(0, Number(row.allocated) || 0);
  const available = Math.max(0, onHand - allocated);
  return {
    id: String(row.id || ""),
    sku: String(row.sku || "").trim(),
    product: String(row.product || "").trim(),
    brand: String(row.brand || "").trim(),
    color: String(row.color || "").trim(),
    size: String(row.size || "").trim().toUpperCase(),
    onHand,
    allocated,
    available,
  };
}

function getInventory() {
  const doc = readStore();
  return (doc.items || []).map(normalizeItem);
}

function getInventoryBySku(sku) {
  const s = String(sku || "").trim().toLowerCase();
  return getInventory().find((x) => x.sku.toLowerCase() === s) || null;
}

function nextId() {
  return `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function addInventoryItem(item) {
  const doc = readStore();
  const row = normalizeItem({ ...item, id: item.id || nextId() });
  if (!row.sku) row.sku = `SKU-${row.id}`;
  doc.items = doc.items || [];
  doc.items.push(row);
  writeStore(doc);
  return row;
}

function updateInventoryItem(id, updates) {
  const doc = readStore();
  const idx = (doc.items || []).findIndex((x) => String(x.id) === String(id));
  if (idx < 0) return null;
  const merged = normalizeItem({ ...doc.items[idx], ...updates, id });
  doc.items[idx] = merged;
  writeStore(doc);
  return merged;
}

/**
 * Apply allocation deltas from planner (POST /inventory/allocate).
 * Each entry: { sku, qtyAllocate } — increases allocated if stock allows.
 */
function applyAllocationDeltas(deltas) {
  const doc = readStore();
  const items = doc.items || [];
  const out = [];
  for (const d of Array.isArray(deltas) ? deltas : []) {
    const sku = String(d.sku || "").trim();
    const want = Math.max(0, Number(d.qtyAllocate) || 0);
    if (!sku || want <= 0) continue;
    const idx = items.findIndex((x) => String(x.sku).toLowerCase() === sku.toLowerCase());
    if (idx < 0) {
      out.push({ sku, ok: false, reason: "sku_not_found" });
      continue;
    }
    const row = normalizeItem(items[idx]);
    const can = Math.max(0, row.onHand - row.allocated);
    const add = Math.min(want, can);
    row.allocated += add;
    items[idx] = normalizeItem(row);
    out.push({ sku, ok: true, allocated: add, short: want - add });
  }
  doc.items = items;
  writeStore(doc);
  return out;
}

function allocateInventory(requirements) {
  const { allocateBlanks } = require("./blankAllocationEngine");
  return allocateBlanks(requirements, getInventory());
}

module.exports = {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  applyAllocationDeltas,
  getInventoryBySku,
  allocateInventory,
};
