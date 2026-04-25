"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let Resend = null;
try { Resend = require("resend").Resend; } catch (_) {}
let twilio = null;
try { twilio = require("twilio"); } catch (_) {}
const { getPrisma } = require("./decisionEngine");
const {
  buildDepositReminder,
  buildPickupNotification,
  buildStatusUpdate,
} = require("./communicationTemplateService");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "communications.json");
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify({ communications: [] }, null, 2), "utf8");
    }
  } catch (e) {
    console.warn("[communicationService] ensureFile:", e && e.message ? e.message : e);
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return Array.isArray(doc.communications) ? doc.communications : [];
  } catch (_e) {
    return [];
  }
}

function writeAll(rows) {
  ensureFile();
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ communications: rows }, null, 2), "utf8");
  } catch (e) {
    console.warn("[communicationService] writeAll:", e && e.message ? e.message : e);
  }
}

function genId() {
  return `COM-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * @param {object} data
 */
function createCommunicationRecord(data) {
  const list = readAll();
  const now = new Date().toISOString();
  const row = {
    id: data && data.id ? String(data.id) : genId(),
    channel: String((data && data.channel) || "EMAIL").toUpperCase(),
    direction: String((data && data.direction) || "OUTBOUND").toUpperCase(),
    relatedType: String((data && data.relatedType) || "GENERAL").toUpperCase(),
    relatedId: data && data.relatedId != null ? String(data.relatedId) : "",
    customerId: data && data.customerId != null ? String(data.customerId) : null,
    vendorKey: data && data.vendorKey != null ? String(data.vendorKey) : null,
    templateKey: String((data && data.templateKey) || "FOLLOWUP_GENERAL"),
    subject: data && data.subject != null ? String(data.subject) : null,
    body: String((data && data.body) || ""),
    toAddress: data && data.toAddress != null ? String(data.toAddress) : null,
    toPhone: data && data.toPhone != null ? String(data.toPhone) : null,
    status: String((data && data.status) || "DRAFT").toUpperCase(),
    provider: data && data.provider != null ? String(data.provider) : null,
    providerMessageId: data && data.providerMessageId != null ? String(data.providerMessageId) : null,
    dedupeKey: data && data.dedupeKey != null ? String(data.dedupeKey) : null,
    error: data && data.error != null ? String(data.error) : null,
    createdAt: (data && data.createdAt) || now,
    sentAt: data && data.sentAt != null ? String(data.sentAt) : null,
    metadata: data && data.metadata && typeof data.metadata === "object" ? data.metadata : {},
  };
  list.push(row);
  writeAll(list);
  return row;
}

function updateCommunicationRecord(id, updates) {
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
  };
  list[idx] = merged;
  writeAll(list);
  return merged;
}

function listCommunications(filters) {
  let rows = readAll();
  const f = filters && typeof filters === "object" ? filters : {};
  if (f.status) {
    const st = String(f.status).toUpperCase();
    rows = rows.filter((r) => String(r.status || "").toUpperCase() === st);
  }
  if (f.channel) {
    const ch = String(f.channel).toUpperCase();
    rows = rows.filter((r) => String(r.channel || "").toUpperCase() === ch);
  }
  if (f.relatedType) {
    const rt = String(f.relatedType).toUpperCase();
    rows = rows.filter((r) => String(r.relatedType || "").toUpperCase() === rt);
  }
  if (f.relatedId) {
    const rid = String(f.relatedId);
    rows = rows.filter((r) => String(r.relatedId) === rid);
  }
  if (f.customerId) {
    const cid = String(f.customerId);
    rows = rows.filter((r) => r.customerId && String(r.customerId) === cid);
  }
  if (f.templateKey) {
    const tk = String(f.templateKey).toUpperCase();
    rows = rows.filter((r) => String(r.templateKey || "").toUpperCase() === tk);
  }
  if (f.since) {
    const t = new Date(f.since).getTime();
    rows = rows.filter((r) => new Date(r.createdAt || 0).getTime() >= t);
  }
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const limit = f.limit != null ? Math.min(500, Math.max(1, Number(f.limit) || 100)) : 100;
  return rows.slice(0, limit);
}

function getCommunicationsByRelated(relatedType, relatedId) {
  const rt = String(relatedType || "").toUpperCase();
  const rid = String(relatedId || "").trim();
  return readAll()
    .filter((r) => String(r.relatedType || "").toUpperCase() === rt && String(r.relatedId) === rid)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function findRecentMatchingCommunication(dedupeKey, withinHours) {
  const key = String(dedupeKey || "").trim();
  if (!key) return null;
  const hours = Math.max(0.01, Number(withinHours) || 24);
  const cutoff = Date.now() - hours * 3600 * 1000;
  const rows = readAll().filter(
    (r) => r.dedupeKey === key && String(r.status || "").toUpperCase() === "SENT"
  );
  let best = null;
  for (const r of rows) {
    const sent = r.sentAt ? new Date(r.sentAt).getTime() : new Date(r.createdAt || 0).getTime();
    const t = Number.isFinite(sent) ? sent : 0;
    if (t >= cutoff) {
      if (!best || t > new Date(best.sentAt || best.createdAt || 0).getTime()) best = r;
    }
  }
  return best;
}

/** Remove rows matching predicate (used by demo clear — predicate must be strict). */
function removeCommunicationsWhere(pred) {
  const list = readAll();
  const next = list.filter((r) => !pred(r));
  if (next.length === list.length) return 0;
  writeAll(next);
  return list.length - next.length;
}

function countByStatusToday(status) {
  const day = new Date().toISOString().slice(0, 10);
  const st = String(status || "").toUpperCase();
  return readAll().filter((r) => {
    if (String(r.status || "").toUpperCase() !== st) return false;
    const iso = r.sentAt || r.createdAt;
    return String(iso || "").slice(0, 10) === day;
  }).length;
}

function buildFingerprint(orderId, type) {
  const key = [String(orderId), String(type), new Date().toISOString()].join("|");
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function createCommunicationDraft(order, draft) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.revenueFollowup.create({
    data: {
      orderId: order.id,
      kind: draft.type,
      status: "READY",
      subject: draft.subject,
      draftText: draft.text,
      draftHtml: draft.html,
      fingerprint: buildFingerprint(order.id, draft.type),
    },
  });
}

async function generateDepositReminder(order) {
  return createCommunicationDraft(order, buildDepositReminder(order));
}

async function generatePickupNotification(order) {
  return createCommunicationDraft(order, buildPickupNotification(order));
}

async function generateStatusUpdate(order) {
  return createCommunicationDraft(order, buildStatusUpdate(order));
}

async function sendEmailReminder(order) {
  console.log("EMAIL PREVIEW:");
  console.log(`To: ${(order && order.email) || ""}`);
  console.log("Subject: Deposit Reminder");
  console.log(
    `Message: Hey ${(order && order.customerName) || ""}, just following up on your order deposit. Let me know if you need anything.`
  );
  return { success: true };
}

async function sendSmsReminder(order) {
  console.log("SMS PREVIEW:");
  console.log(`To: ${(order && order.phone) || ""}`);
  console.log(
    `Message: Hey ${(order && order.customerName) || ""}, just following up on your order deposit. Let me know if you need anything.`
  );
  return { success: true };
}

module.exports = {
  sendEmailReminder,
  sendSmsReminder,
  generateDepositReminder,
  generatePickupNotification,
  generateStatusUpdate,
  createCommunicationRecord,
  updateCommunicationRecord,
  listCommunications,
  getCommunicationsByRelated,
  findRecentMatchingCommunication,
  countByStatusToday,
  removeCommunicationsWhere,
};
