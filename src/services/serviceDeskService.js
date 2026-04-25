/**
 * Service desk items — file-backed (additive).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "service-desk-items.json");
const FLAGS_FILE = path.join(DATA_DIR, "service-desk-flags.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ items: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return Array.isArray(doc.items) ? doc.items : [];
  } catch (_e) {
    return [];
  }
}

function writeAll(rows) {
  ensureFile();
  try {
    fs.writeFileSync(STORE, JSON.stringify({ items: rows }, null, 2), "utf8");
  } catch (e) {
    console.warn("[serviceDeskService] write failed:", e && e.message ? e.message : e);
  }
}

function genId() {
  return `SD-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function createServiceDeskItem(data) {
  const d = data && typeof data === "object" ? data : {};
  const now = new Date().toISOString();
  const row = {
    id: d.id || genId(),
    source: String(d.source || "MANUAL").toUpperCase(),
    relatedType: String(d.relatedType || "GENERAL").toUpperCase(),
    relatedId: d.relatedId != null ? String(d.relatedId) : "",
    customerId: d.customerId != null ? String(d.customerId) : null,
    category: String(d.category || "GENERAL").toUpperCase(),
    priority: String(d.priority || "MEDIUM").toUpperCase(),
    assignedToRole: String(d.assignedToRole || "ADMIN").toUpperCase(),
    assignedToUserId: d.assignedToUserId != null ? String(d.assignedToUserId) : null,
    state: String(d.state || "NEW").toUpperCase(),
    summary: String(d.summary || "").slice(0, 2000),
    latestResponsePreview: d.latestResponsePreview != null ? String(d.latestResponsePreview).slice(0, 8000) : null,
    requiresApproval: Boolean(d.requiresApproval),
    escalationReason: d.escalationReason != null ? String(d.escalationReason).slice(0, 2000) : null,
    classification: d.classification != null ? String(d.classification) : null,
    waitSubState: d.waitSubState != null ? String(d.waitSubState) : null,
    textSnippet: d.textSnippet != null ? String(d.textSnippet).slice(0, 4000) : null,
    createdAt: d.createdAt || now,
    updatedAt: now,
    metadata: d.metadata && typeof d.metadata === "object" ? d.metadata : {},
  };
  const list = readAll();
  list.push(row);
  writeAll(list);
  return row;
}

function updateServiceDeskItem(id, updates) {
  const list = readAll();
  const idx = list.findIndex((r) => r && r.id === String(id || "").trim());
  if (idx < 0) return null;
  const merged = {
    ...list[idx],
    ...(updates && typeof updates === "object" ? updates : {}),
    id: list[idx].id,
    metadata: {
      ...(list[idx].metadata && typeof list[idx].metadata === "object" ? list[idx].metadata : {}),
      ...(updates && updates.metadata && typeof updates.metadata === "object" ? updates.metadata : {}),
    },
    updatedAt: new Date().toISOString(),
  };
  list[idx] = merged;
  writeAll(list);
  return merged;
}

function getAllServiceDeskItems() {
  return readAll();
}

function removeServiceDeskItemsWhere(pred) {
  const list = readAll();
  const next = list.filter((r) => !pred(r));
  if (next.length === list.length) return 0;
  writeAll(next);
  return list.length - next.length;
}

function listServiceDeskItems(filters) {
  let rows = readAll();
  const f = filters && typeof filters === "object" ? filters : {};
  if (f.states && Array.isArray(f.states) && f.states.length) {
    const set = new Set(f.states.map((s) => String(s || "").toUpperCase()));
    rows = rows.filter((r) => set.has(String(r.state || "").toUpperCase()));
  } else if (f.state) {
    const st = String(f.state).toUpperCase();
    rows = rows.filter((r) => String(r.state || "").toUpperCase() === st);
  }
  if (f.assignedToRole) {
    const ar = String(f.assignedToRole).toUpperCase();
    rows = rows.filter((r) => String(r.assignedToRole || "").toUpperCase() === ar);
  }
  if (f.category) {
    const c = String(f.category).toUpperCase();
    rows = rows.filter((r) => String(r.category || "").toUpperCase() === c);
  }
  if (f.relatedType && f.relatedId) {
    const rt = String(f.relatedType).toUpperCase();
    const rid = String(f.relatedId);
    rows = rows.filter((r) => String(r.relatedType).toUpperCase() === rt && String(r.relatedId) === rid);
  }
  if (f.requiresApproval === true) {
    rows = rows.filter((r) => r && r.requiresApproval === true);
  }
  rows.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  const limit = f.limit != null ? Math.min(500, Math.max(1, Number(f.limit) || 100)) : 100;
  return rows.slice(0, limit);
}

function assignServiceDeskItem(id, assignment) {
  const a = assignment && typeof assignment === "object" ? assignment : {};
  return updateServiceDeskItem(id, {
    assignedToRole: a.assignedToRole != null ? String(a.assignedToRole).toUpperCase() : undefined,
    assignedToUserId: a.assignedToUserId != null ? String(a.assignedToUserId) : undefined,
    state: a.state != null ? String(a.state).toUpperCase() : undefined,
  });
}

function closeServiceDeskItem(id) {
  return updateServiceDeskItem(id, { state: "CLOSED" });
}

function getServiceDeskItem(id) {
  const p = String(id || "").trim();
  return readAll().find((r) => r && r.id === p) || null;
}

function countByState(st) {
  const s = String(st || "").toUpperCase();
  return readAll().filter((r) => String(r.state || "").toUpperCase() === s).length;
}

function getServiceDeskFlags() {
  try {
    if (!fs.existsSync(FLAGS_FILE)) return { forcePreviewOnly: false };
    const raw = fs.readFileSync(FLAGS_FILE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return {
      forcePreviewOnly: Boolean(doc.forcePreviewOnly),
      ...(typeof doc === "object" && doc ? doc : {}),
    };
  } catch (_e) {
    return { forcePreviewOnly: false };
  }
}

function setServiceDeskFlags(partial) {
  const cur = getServiceDeskFlags();
  const next = { ...cur, ...(partial && typeof partial === "object" ? partial : {}) };
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FLAGS_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch (e) {
    console.warn("[serviceDeskService] flags write failed:", e && e.message ? e.message : e);
  }
  return next;
}

module.exports = {
  createServiceDeskItem,
  updateServiceDeskItem,
  listServiceDeskItems,
  assignServiceDeskItem,
  closeServiceDeskItem,
  getServiceDeskItem,
  countByState,
  getAllServiceDeskItems,
  removeServiceDeskItemsWhere,
  getServiceDeskFlags,
  setServiceDeskFlags,
};
