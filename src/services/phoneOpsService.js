/**
 * Shop phone / SMS abstraction — webhook-ready, file-backed when providers absent.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { addTimelineEvent } = require("./timelineService");
const { logInbound } = require("./inboundOpsLog");
const { createServiceDeskItem } = require("./serviceDeskService");
const { getOrCreateCustomer } = require("./customerMatchService");

const DATA_DIR = path.join(process.cwd(), "data");
const SMS_FILE = path.join(DATA_DIR, "inbound-sms.json");
const CALL_FILE = path.join(DATA_DIR, "inbound-calls.json");

function appendJson(file, row) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    let list = [];
    if (fs.existsSync(file)) {
      list = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
      if (!Array.isArray(list)) list = [];
    }
    list.push(row);
    fs.writeFileSync(file, JSON.stringify(list.slice(-3000), null, 2), "utf8");
  } catch (e) {
    console.warn("[phoneOpsService] append failed:", e && e.message ? e.message : e);
  }
}

function normalizePhoneEvent(payload, channel) {
  const p = payload && typeof payload === "object" ? payload : {};
  const ch = String(channel || "SMS").toUpperCase();
  if (ch === "SMS") {
    return {
      channel: "SMS",
      fromPhone: String(p.fromPhone || p.from || "").trim(),
      body: String(p.body || p.message || "").slice(0, 8000),
      receivedAt: p.receivedAt || new Date().toISOString(),
      providerMessageId: p.providerMessageId != null ? String(p.providerMessageId) : null,
    };
  }
  return {
    channel: "VOICE",
    fromPhone: String(p.fromPhone || p.from || "").trim(),
    receivedAt: p.receivedAt || new Date().toISOString(),
    transcript: String(p.transcript || "").slice(0, 50000),
    durationSeconds: Number(p.durationSeconds) || 0,
    providerCallId: p.providerCallId != null ? String(p.providerCallId) : null,
  };
}

function routePhoneEventToServiceDesk(normalized) {
  const sum =
    normalized.channel === "SMS"
      ? `SMS: ${(normalized.body || "").slice(0, 160)}`
      : `Call ${normalized.durationSeconds || 0}s`;
  return createServiceDeskItem({
    source: "PHONE",
    relatedType: "GENERAL",
    relatedId: normalized.providerMessageId || normalized.providerCallId || "",
    category: "GENERAL",
    state: "WAITING_TEAM",
    summary: sum,
    assignedToRole: "ADMIN",
    metadata: { phone: normalized.fromPhone, channel: normalized.channel },
  });
}

function ingestInboundSMS(payload) {
  const n = normalizePhoneEvent(payload, "SMS");
  const id = `sms-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  appendJson(SMS_FILE, { id, ...n, storedAt: new Date().toISOString() });
  logInbound("inbound_sms_ingested", { id });

  const cust = getOrCreateCustomer({ name: n.fromPhone, phone: n.fromPhone, email: "" });
  const customerId = cust.customer ? cust.customer.id : null;

  addTimelineEvent({
    relatedType: "CUSTOMER",
    relatedId: customerId || "UNKNOWN",
    customerId,
    channel: "SMS",
    eventType: "INBOUND_SMS",
    title: "Inbound SMS",
    summary: n.body.slice(0, 4000),
    rawRefId: id,
    createdByType: "CUSTOMER",
    metadata: { fromPhone: n.fromPhone, providerMessageId: n.providerMessageId },
  });

  const sd = routePhoneEventToServiceDesk(n);
  logInbound("entity_match_made", { serviceDeskId: sd.id });

  return {
    ok: true,
    id,
    normalized: n,
    customerId,
    serviceDeskId: sd.id,
    degraded: !process.env.TWILIO_ACCOUNT_SID,
  };
}

function ingestInboundCall(payload) {
  const n = normalizePhoneEvent(payload, "VOICE");
  const id = `call-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  appendJson(CALL_FILE, { id, ...n, storedAt: new Date().toISOString() });
  logInbound("inbound_call_ingested", { id });

  const cust = getOrCreateCustomer({ name: n.fromPhone, phone: n.fromPhone, email: "" });
  const customerId = cust.customer ? cust.customer.id : null;

  addTimelineEvent({
    relatedType: "CUSTOMER",
    relatedId: customerId || "UNKNOWN",
    customerId,
    channel: "VOICE",
    eventType: "INBOUND_CALL",
    title: "Inbound call",
    summary: (n.transcript || "").slice(0, 4000) || `Duration ${n.durationSeconds}s`,
    rawRefId: id,
    createdByType: "CUSTOMER",
    metadata: { fromPhone: n.fromPhone, providerCallId: n.providerCallId },
  });

  const sd = routePhoneEventToServiceDesk(n);

  return {
    ok: true,
    id,
    normalized: n,
    customerId,
    serviceDeskId: sd.id,
    degraded: true,
  };
}

function listSmsSince(sinceIso) {
  try {
    if (!fs.existsSync(SMS_FILE)) return [];
    const list = JSON.parse(fs.readFileSync(SMS_FILE, "utf8") || "[]");
    if (!Array.isArray(list)) return [];
    const t = sinceIso ? new Date(sinceIso).getTime() : 0;
    return list.filter((r) => new Date(r.receivedAt || r.storedAt || 0).getTime() >= t);
  } catch (_e) {
    return [];
  }
}

function listCallsSince(sinceIso) {
  try {
    if (!fs.existsSync(CALL_FILE)) return [];
    const list = JSON.parse(fs.readFileSync(CALL_FILE, "utf8") || "[]");
    if (!Array.isArray(list)) return [];
    const t = sinceIso ? new Date(sinceIso).getTime() : 0;
    return list.filter((r) => new Date(r.receivedAt || r.storedAt || 0).getTime() >= t);
  } catch (_e) {
    return [];
  }
}

module.exports = {
  ingestInboundSMS,
  ingestInboundCall,
  normalizePhoneEvent,
  routePhoneEventToServiceDesk,
  listSmsSince,
  listCallsSince,
};
