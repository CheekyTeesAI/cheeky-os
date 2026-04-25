/**
 * Inbound email — preserve raw, normalize, match, timeline.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { matchEmailToContext } = require("./emailThreadMatchService");
const { addTimelineEvent } = require("./timelineService");
const { logInbound } = require("./inboundOpsLog");
const { detectArtFromIntake, linkAttachmentsToIntake, guessKind } = require("./intakeArtService");
const { createIntakeRecord } = require("./intakeService");
const { createServiceDeskItem } = require("./serviceDeskService");
const { getOrCreateCustomer } = require("./customerMatchService");
const { attachArtToIntakeOrJob } = require("./artOpsService");

const DATA_DIR = path.join(process.cwd(), "data");
const RAW_FILE = path.join(DATA_DIR, "inbound-email-raw.json");

function ensureRaw() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(RAW_FILE)) {
      fs.writeFileSync(RAW_FILE, JSON.stringify({ version: 1, messages: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readRawMessages() {
  ensureRaw();
  try {
    const cur = JSON.parse(fs.readFileSync(RAW_FILE, "utf8") || "{}");
    return Array.isArray(cur.messages) ? cur.messages : [];
  } catch (_e) {
    return [];
  }
}

/**
 * @param {string} [sinceIso]
 */
function listRecentEmailsSince(sinceIso) {
  const list = readRawMessages();
  const t = sinceIso ? new Date(sinceIso).getTime() : 0;
  return list.filter((m) => new Date(m.receivedAt || m.storedAt || 0).getTime() >= t);
}

function appendRaw(doc) {
  ensureRaw();
  try {
    const cur = JSON.parse(fs.readFileSync(RAW_FILE, "utf8") || "{}");
    const messages = Array.isArray(cur.messages) ? cur.messages : [];
    messages.push(doc);
    fs.writeFileSync(RAW_FILE, JSON.stringify({ version: 1, messages: messages.slice(-2000) }, null, 2), "utf8");
  } catch (e) {
    console.warn("[emailInboxService] raw append failed:", e && e.message ? e.message : e);
  }
}

function genMessageId() {
  return `em-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * @param {object} payload
 */
function normalizeInboundEmail(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const receivedAt = p.receivedAt || new Date().toISOString();
  return {
    sourceMessageId: String(p.sourceMessageId || p.messageId || genMessageId()),
    fromName: String(p.fromName || p.from?.name || "").trim(),
    fromEmail: String(p.fromEmail || p.from?.email || "")
      .trim()
      .toLowerCase(),
    subject: String(p.subject || "").slice(0, 2000),
    bodyText: String(p.bodyText || p.text || "").slice(0, 50000),
    bodyHtml: p.bodyHtml != null ? String(p.bodyHtml).slice(0, 200000) : "",
    attachments: Array.isArray(p.attachments) ? p.attachments : [],
    receivedAt,
  };
}

function matchInboundEmailToEntities(email) {
  return matchEmailToContext(email);
}

function createTimelineFromEmail(email, ctx) {
  const ids = [];
  const baseMeta = {
    fromEmail: email.fromEmail,
    subject: email.subject.slice(0, 200),
    match: ctx,
  };
  if (ctx.matchedType === "JOB" && ctx.matchedId) {
    ids.push(
      addTimelineEvent({
        relatedType: "JOB",
        relatedId: ctx.matchedId,
        customerId: ctx.customerId != null ? ctx.customerId : null,
        channel: "EMAIL",
        eventType: "INBOUND_EMAIL",
        title: email.subject.slice(0, 120) || "Inbound email",
        summary: email.bodyText.slice(0, 4000),
        rawRefId: `email:${email.sourceMessageId}`,
        createdByType: "CUSTOMER",
        metadata: baseMeta,
      }).id,
    );
  }
  if (ctx.matchedType === "INTAKE" && ctx.matchedId) {
    ids.push(
      addTimelineEvent({
        relatedType: "INTAKE",
        relatedId: ctx.matchedId,
        customerId: ctx.customerId != null ? ctx.customerId : null,
        channel: "EMAIL",
        eventType: "INBOUND_EMAIL",
        title: email.subject.slice(0, 120) || "Inbound email",
        summary: email.bodyText.slice(0, 4000),
        rawRefId: `email:${email.sourceMessageId}`,
        createdByType: "CUSTOMER",
        metadata: baseMeta,
      }).id,
    );
  }
  if (ctx.matchedType === "CUSTOMER" && ctx.matchedId) {
    ids.push(
      addTimelineEvent({
        relatedType: "CUSTOMER",
        relatedId: ctx.matchedId,
        customerId: ctx.matchedId,
        channel: "EMAIL",
        eventType: "INBOUND_EMAIL",
        title: email.subject.slice(0, 120) || "Inbound email",
        summary: email.bodyText.slice(0, 4000),
        rawRefId: `email:${email.sourceMessageId}`,
        createdByType: "CUSTOMER",
        metadata: baseMeta,
      }).id,
    );
  }
  return ids;
}

/**
 * @param {object} payload
 */
function ingestInboundEmail(payload) {
  const normalized = normalizeInboundEmail(payload);
  const rawEntry = {
    storedAt: new Date().toISOString(),
    ...normalized,
  };
  appendRaw(rawEntry);
  logInbound("inbound_email_ingested", { sourceMessageId: normalized.sourceMessageId });

  const match = matchInboundEmailToEntities(normalized);
  const cust = getOrCreateCustomer({
    name: normalized.fromName || normalized.fromEmail || "Unknown",
    email: normalized.fromEmail,
  });
  const customerId = cust.customer && cust.customer.id ? cust.customer.id : null;

  const ctx = {
    ...match,
    customerId,
  };

  let createdIntakeId = null;
  let createdServiceDeskId = null;
  const timelineEventIds = [];

  const artHint = detectArtFromIntake(
    { body: normalized.bodyText, subject: normalized.subject },
    normalized.attachments,
  );

  if (match.matchedType === "UNKNOWN") {
    const intake = createIntakeRecord({
      source: "EMAIL",
      rawSubject: normalized.subject,
      rawBody: normalized.bodyText,
      normalizedText: `${normalized.subject}\n${normalized.bodyText}`.slice(0, 8000),
      intent: artHint.artDetected ? "ART" : "INQUIRY",
      status: "NEW",
      customerId,
      reviewRequired: true,
      missingFields: match.matchedType === "UNKNOWN" ? ["routing"] : [],
      extractedData: { fromEmail: normalized.fromEmail, artHint },
    });
    createdIntakeId = intake.id;
    const linked = linkAttachmentsToIntake(intake.id, normalized.attachments);
    for (const f of linked) {
      if (guessKind(f.filename, f.mimeType) === "ART") {
        attachArtToIntakeOrJob("INTAKE", intake.id, {
          filename: f.filename,
          path: f.path,
          mimeType: f.mimeType,
          source: "EMAIL",
        });
      }
    }
    timelineEventIds.push(
      addTimelineEvent({
        relatedType: "INTAKE",
        relatedId: intake.id,
        customerId,
        channel: "EMAIL",
        eventType: "INTAKE_CREATED",
        title: "Email → intake",
        summary: normalized.subject.slice(0, 500),
        rawRefId: `email:${normalized.sourceMessageId}`,
        metadata: { reviewRequired: true },
      }).id,
    );
  } else if (match.matchedType === "INTAKE" && match.matchedId) {
    const linked = linkAttachmentsToIntake(match.matchedId, normalized.attachments);
    for (const f of linked) {
      if (guessKind(f.filename, f.mimeType) === "ART") {
        attachArtToIntakeOrJob("INTAKE", match.matchedId, {
          filename: f.filename,
          path: f.path,
          mimeType: f.mimeType,
          source: "EMAIL",
        });
      }
    }
  } else if (match.matchedType === "JOB" && match.matchedId) {
    for (const a of normalized.attachments) {
      if (!a || !a.path) continue;
      try {
        if (guessKind(a.filename, a.contentType) === "ART") {
          attachArtToIntakeOrJob("JOB", match.matchedId, {
            filename: a.filename,
            path: a.path,
            mimeType: a.contentType,
            source: "EMAIL",
          });
        }
      } catch (_e) {
        /* skip */
      }
    }
  }

  if (match.reviewRequired && match.matchedType === "JOB" && match.matchedId) {
    const sd = createServiceDeskItem({
      relatedType: "JOB",
      relatedId: match.matchedId,
      category: "GENERAL",
      state: "WAITING_TEAM",
      summary: `Inbound email needs confirmation: ${normalized.subject.slice(0, 120)}`,
      assignedToRole: "ADMIN",
      metadata: { isInboundEmail: true, sourceMessageId: normalized.sourceMessageId },
    });
    createdServiceDeskId = sd.id;
  }

  const tl = createTimelineFromEmail(normalized, ctx);
  timelineEventIds.push(...tl);

  logInbound("timeline_event_created", { count: timelineEventIds.length });
  return {
    ok: true,
    normalized,
    match,
    customerId,
    createdIntakeId,
    createdServiceDeskId,
    artDetected: artHint.artDetected,
    reviewRequired: match.reviewRequired || match.matchedType === "UNKNOWN",
    timelineEventIds,
    degraded: false,
  };
}

module.exports = {
  ingestInboundEmail,
  normalizeInboundEmail,
  matchInboundEmailToEntities,
  createTimelineFromEmail,
  listRecentEmailsSince,
};
