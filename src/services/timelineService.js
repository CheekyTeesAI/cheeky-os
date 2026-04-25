/**
 * Unified timeline — file-backed (additive). Future: optional Prisma table.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "timeline-events.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      fs.writeFileSync(FILE, JSON.stringify({ version: 1, events: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readAll() {
  ensureFile();
  try {
    const doc = JSON.parse(fs.readFileSync(FILE, "utf8") || "{}");
    return Array.isArray(doc.events) ? doc.events : [];
  } catch (_e) {
    return [];
  }
}

function writeAll(events) {
  ensureFile();
  try {
    fs.writeFileSync(FILE, JSON.stringify({ version: 1, events }, null, 2), "utf8");
  } catch (e) {
    console.warn("[timelineService] write failed:", e && e.message ? e.message : e);
  }
}

function genId() {
  return `TL-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * @param {object} data
 */
function addTimelineEvent(data) {
  const d = data && typeof data === "object" ? data : {};
  const now = new Date().toISOString();
  const row = {
    id: d.id || genId(),
    relatedType: String(d.relatedType || "GENERAL").toUpperCase(),
    relatedId: d.relatedId != null ? String(d.relatedId) : "",
    customerId: d.customerId != null ? String(d.customerId) : null,
    channel: String(d.channel || "SYSTEM").toUpperCase(),
    eventType: String(d.eventType || "NOTE").toUpperCase(),
    title: String(d.title || "").slice(0, 500),
    summary: String(d.summary || "").slice(0, 8000),
    rawRefId: d.rawRefId != null ? String(d.rawRefId) : null,
    createdByType: String(d.createdByType || "SYSTEM").toUpperCase(),
    createdById: d.createdById != null ? String(d.createdById) : null,
    metadata: d.metadata && typeof d.metadata === "object" ? d.metadata : {},
    createdAt: d.createdAt || now,
  };
  const list = readAll();
  list.push(row);
  writeAll(list);
  return row;
}

function getTimelineForRelated(relatedType, relatedId) {
  const rt = String(relatedType || "").toUpperCase();
  const rid = String(relatedId || "").trim();
  return readAll()
    .filter((e) => e && String(e.relatedType || "").toUpperCase() === rt && String(e.relatedId) === rid)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function getCustomerTimeline(customerId) {
  const cid = String(customerId || "").trim();
  return readAll()
    .filter((e) => e && e.customerId === cid)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

/**
 * @param {{ since?: string, channel?: string, relatedType?: string, limit?: number }} filters
 */
function getRecentTimeline(filters) {
  const f = filters && typeof filters === "object" ? filters : {};
  const limit = Math.min(500, Math.max(1, Number(f.limit) || 100));
  let rows = readAll();
  if (f.since) {
    const t = new Date(f.since).getTime();
    rows = rows.filter((e) => new Date(e.createdAt || 0).getTime() >= t);
  }
  if (f.channel) {
    const ch = String(f.channel).toUpperCase();
    rows = rows.filter((e) => String(e.channel || "").toUpperCase() === ch);
  }
  if (f.relatedType) {
    const rt = String(f.relatedType).toUpperCase();
    rows = rows.filter((e) => String(e.relatedType || "").toUpperCase() === rt);
  }
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return rows.slice(0, limit);
}

/**
 * Merge stored timeline with communication records (additive enrichment).
 */
function getAggregatedForJob(jobId) {
  const jid = String(jobId || "").trim();
  const base = getTimelineForRelated("JOB", jid);
  let extra = [];
  try {
    const { listCommunications } = require("./communicationService");
    const comms = listCommunications({ relatedType: "JOB", relatedId: jid, limit: 200 });
    const seen = new Set(base.map((e) => e.rawRefId).filter(Boolean));
    for (const c of comms) {
      const ref = `comm:${c.id}`;
      if (seen.has(ref)) continue;
      extra.push({
        id: `syn-${c.id}`,
        relatedType: "JOB",
        relatedId: jid,
        customerId: c.customerId || null,
        channel: String(c.channel || "EMAIL").toUpperCase(),
        eventType: "COMMUNICATION",
        title: `Communication ${String(c.status || "").toUpperCase()}`,
        summary: (c.subject || c.body || "").slice(0, 2000),
        rawRefId: ref,
        createdByType: "SYSTEM",
        createdById: null,
        metadata: { communicationId: c.id, synthetic: true },
        createdAt: c.createdAt || c.sentAt,
      });
    }
  } catch (_e) {
    /* ignore */
  }
  return [...base, ...extra].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function getAggregatedForCustomer(customerId) {
  const cid = String(customerId || "").trim();
  const base = getCustomerTimeline(cid);
  let extra = [];
  try {
    const { listCommunications } = require("./communicationService");
    const comms = listCommunications({ customerId: cid, limit: 200 });
    const seen = new Set(base.map((e) => e.rawRefId).filter(Boolean));
    for (const c of comms) {
      const ref = `comm:${c.id}`;
      if (seen.has(ref)) continue;
      extra.push({
        id: `syn-${c.id}`,
        relatedType: "CUSTOMER",
        relatedId: cid,
        customerId: cid,
        channel: String(c.channel || "EMAIL").toUpperCase(),
        eventType: "COMMUNICATION",
        title: `Communication ${String(c.status || "").toUpperCase()}`,
        summary: (c.subject || c.body || "").slice(0, 2000),
        rawRefId: ref,
        createdByType: "SYSTEM",
        createdById: null,
        metadata: { communicationId: c.id, synthetic: true },
        createdAt: c.createdAt || c.sentAt,
      });
    }
  } catch (_e) {
    /* ignore */
  }
  return [...base, ...extra].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

module.exports = {
  addTimelineEvent,
  getTimelineForRelated,
  getCustomerTimeline,
  getRecentTimeline,
  getAggregatedForJob,
  getAggregatedForCustomer,
};
