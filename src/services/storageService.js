const fs = require("fs");
const path = require("path");
const { appendAuditLog } = require("../mocks/onedriveMock");

const STORE_PATH = path.join(__dirname, "..", "..", "data", "cheeky-store.json");
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function ensureStoreFile() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const seed = { orders: [], contacts: [], auditLogs: [], updatedAt: new Date().toISOString() };
    fs.writeFileSync(STORE_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

function readLocal() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[storageService] local read failed, resetting:", error && error.message ? error.message : error);
    const reset = { orders: [], contacts: [], auditLogs: [], updatedAt: new Date().toISOString() };
    fs.writeFileSync(STORE_PATH, JSON.stringify(reset, null, 2), "utf8");
    return reset;
  }
}

function writeLocal(next) {
  ensureStoreFile();
  const payload = { ...next, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function writeGraphLog(entry) {
  const token = String(process.env.MSGRAPH_ACCESS_TOKEN || "").trim();
  if (!token) {
    return { ...appendAuditLog(entry), success: false, reason: "MSGRAPH_ACCESS_TOKEN missing; onedriveMock active" };
  }
  const driveItemId = String(process.env.ONEDRIVE_AUDIT_ITEM_ID || "").trim();
  if (!driveItemId) {
    return { ...appendAuditLog(entry), success: false, reason: "ONEDRIVE_AUDIT_ITEM_ID missing; onedriveMock active" };
  }
  try {
    const current = await fetch(`${GRAPH_BASE}/me/drive/items/${driveItemId}/content`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    let state = { orders: [], contacts: [], auditLogs: [] };
    if (current.ok) {
      const text = await current.text();
      try {
        const parsed = JSON.parse(text || "{}");
        state.orders = Array.isArray(parsed.orders) ? parsed.orders : [];
        state.contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
        state.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
      } catch (_error) {
        state = { orders: [], contacts: [], auditLogs: [] };
      }
    }
    state.auditLogs.push(entry);
    const put = await fetch(`${GRAPH_BASE}/me/drive/items/${driveItemId}/content`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    });
    if (!put.ok) {
      const errText = await put.text();
      return { success: false, reason: `graph_put_${put.status}`, detail: errText };
    }
    return { success: true, reason: null };
  } catch (error) {
    return {
      ...appendAuditLog(entry),
      success: false,
      reason: `${error && error.message ? error.message : "graph_write_failed"}; onedriveMock active`,
    };
  }
}

function saveOrder(order) {
  const entry = { ...order, storedAt: new Date().toISOString() };
  const state = readLocal();
  state.orders.push(entry);
  writeLocal(state);
  return { success: true, stored: "local", entry };
}

function saveContact(contact) {
  const entry = { ...contact, storedAt: new Date().toISOString() };
  const state = readLocal();
  state.contacts.push(entry);
  writeLocal(state);
  return { success: true, stored: "local", entry };
}

async function saveAuditLog(log) {
  const entry = { ...log, storedAt: new Date().toISOString() };
  const state = readLocal();
  state.auditLogs.push(entry);
  writeLocal(state);
  const graph = await writeGraphLog(entry);
  if (!graph.success) {
    console.warn("[storageService] graph write failed; local fallback retained:", graph.reason);
  }
  return { success: true, stored: graph.success ? "graph+local" : "local", entry, graph };
}

function readAll() {
  return { success: true, stored: "local", data: readLocal() };
}

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_ROOT)) {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
    console.log("[storageService] created uploads root at", UPLOADS_ROOT);
  }
} catch (error) {
  console.warn("[storageService] could not ensure uploads root:", error && error.message ? error.message : error);
}

function ensureUploadDir(jobId) {
  try {
    const safeId = String(jobId || "unknown").replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const dir = path.join(UPLOADS_ROOT, safeId);
    if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (error) {
    console.warn("[storageService] ensureUploadDir failed:", error && error.message ? error.message : error);
    return null;
  }
}

function saveArtFile(jobId, file) {
  try {
    const dir = ensureUploadDir(jobId);
    if (!dir) return { success: false, reason: "upload_dir_unavailable" };
    const fileMeta = file && typeof file === "object" ? file : {};
    const fileName = String(fileMeta.name || fileMeta.filename || `art-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const fullPath = path.join(dir, fileName);
    if (fileMeta.buffer && Buffer.isBuffer(fileMeta.buffer)) {
      fs.writeFileSync(fullPath, fileMeta.buffer);
    } else if (typeof fileMeta.content === "string") {
      const encoding = fileMeta.encoding === "base64" ? "base64" : "utf8";
      fs.writeFileSync(fullPath, Buffer.from(fileMeta.content, encoding));
    } else {
      fs.writeFileSync(fullPath, JSON.stringify({ placeholder: true, receivedAt: new Date().toISOString() }, null, 2), "utf8");
    }
    try {
      const { registerArtFile } = require("./foundationJobService");
      Promise.resolve(registerArtFile(jobId, fullPath, "UPLOADED")).catch(() => {});
    } catch (_e) {
      /* foundation optional */
    }
    return {
      success: true,
      jobId,
      path: fullPath,
      storage: "local",
      onedrive_ready: Boolean(String(process.env.MSGRAPH_ACCESS_TOKEN || "").trim()),
    };
  } catch (error) {
    console.error("[storageService] saveArtFile failed:", error && error.message ? error.message : error);
    return { success: false, reason: error && error.message ? error.message : "save_art_failed" };
  }
}

function getArtFiles(jobId) {
  try {
    const safeId = String(jobId || "unknown").replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const dir = path.join(UPLOADS_ROOT, safeId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map((name) => ({
      name,
      path: path.join(dir, name),
      jobId: safeId,
    }));
  } catch (error) {
    console.warn("[storageService] getArtFiles failed:", error && error.message ? error.message : error);
    return [];
  }
}

module.exports = {
  saveOrder,
  saveContact,
  saveAuditLog,
  readAll,
  saveArtFile,
  getArtFiles,
};
