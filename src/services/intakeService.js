/**
 * Intake records — file-backed; orchestrates parse → enrich → match → decide.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { parseIntake } = require("./intakeParser");
const { enrichParsedIntake } = require("./intakeAIEnrichment");
const { getOrCreateCustomer } = require("./customerMatchService");
const { detectArtFromIntake, linkAttachmentsToIntake } = require("./intakeArtService");
const { decideNextStep } = require("./intakeDecisionEngine");
const { detectReorderIntent } = require("./reorderService");
const { logEvent } = require("./foundationEventLog");
const { convertParsedIntakeToJob } = require("./intakeToJobService");
const { buildQuoteDraftFromIntake } = require("./quoteDraftService");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "intake-records.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ records: [] }, null, 2), "utf8");
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
    return Array.isArray(doc.records) ? doc.records : [];
  } catch (_e) {
    return [];
  }
}

function writeStore(records) {
  try {
    ensureFile();
    fs.writeFileSync(STORE, JSON.stringify({ records }, null, 2), "utf8");
  } catch (e) {
    console.warn("[intakeService] writeStore failed:", e && e.message ? e.message : e);
  }
}

async function safeLog(message) {
  try {
    await logEvent(null, "INTAKE", String(message || ""));
  } catch (_e) {
    console.log("[intake]", message);
  }
}

function makeId() {
  return `INT-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((a) => {
    if (typeof a === "string") return { path: a };
    return a && typeof a === "object" ? a : null;
  }).filter(Boolean);
}

function mergeExtracted(base, extra) {
  const out = { ...(base || {}) };
  if (!extra || typeof extra !== "object") return out;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (out[k] === undefined || out[k] === null || out[k] === "") out[k] = v;
  }
  return out;
}

function persistRecord(rec) {
  try {
    const list = readStore();
    const idx = list.findIndex((r) => r.id === rec.id);
    const now = new Date().toISOString();
    const row = { ...rec, updatedAt: now };
    if (idx >= 0) list[idx] = row;
    else {
      row.createdAt = row.createdAt || now;
      list.push(row);
    }
    writeStore(list);
    return row;
  } catch (e) {
    console.warn("[intakeService] persistRecord failed:", e && e.message ? e.message : e);
    return rec;
  }
}

function createIntakeRecord(payload) {
  const id = (payload && payload.id) || makeId();
  const now = new Date().toISOString();
  const row = {
    id,
    source: String((payload && payload.source) || "MANUAL"),
    customerId: payload && payload.customerId != null ? payload.customerId : null,
    rawSubject: String((payload && payload.rawSubject) || ""),
    rawBody: String((payload && payload.rawBody) || ""),
    normalizedText: String((payload && payload.normalizedText) || ""),
    intent: String((payload && payload.intent) || "UNKNOWN"),
    status: String((payload && payload.status) || "NEW"),
    missingFields: Array.isArray(payload && payload.missingFields) ? payload.missingFields : [],
    extractedData: payload && payload.extractedData && typeof payload.extractedData === "object" ? payload.extractedData : {},
    assumptions: Array.isArray(payload && payload.assumptions) ? payload.assumptions : [],
    artDetected: Boolean(payload && payload.artDetected),
    attachmentCount: Math.max(0, Number((payload && payload.attachmentCount) || 0)),
    attachmentsMeta: Array.isArray(payload && payload.attachmentsMeta) ? payload.attachmentsMeta : [],
    createdJobId: payload && payload.createdJobId ? String(payload.createdJobId) : null,
    createdQuoteRef: payload && payload.createdQuoteRef ? String(payload.createdQuoteRef) : null,
    reviewRequired: Boolean(payload && payload.reviewRequired),
    customerMatch: payload && payload.customerMatch && typeof payload.customerMatch === "object" ? payload.customerMatch : {},
    reorder: payload && payload.reorder && typeof payload.reorder === "object" ? payload.reorder : null,
    nextAction: payload && payload.nextAction ? String(payload.nextAction) : null,
    decisionReasons: Array.isArray(payload && payload.decisionReasons) ? payload.decisionReasons : [],
    mock: Boolean(payload && payload.mock),
    isDemo: Boolean(payload && payload.isDemo),
    createdAt: (payload && payload.createdAt) || now,
    updatedAt: now,
  };
  return persistRecord(row);
}

function updateIntakeRecord(id, updates) {
  const list = readStore();
  const idx = list.findIndex((r) => r.id === String(id || "").trim());
  if (idx < 0) return null;
  const merged = { ...list[idx], ...updates, id: list[idx].id, updatedAt: new Date().toISOString() };
  list[idx] = merged;
  writeStore(list);
  return merged;
}

function getIntakeRecords(filters) {
  let rows = readStore();
  const f = filters && typeof filters === "object" ? filters : {};
  if (f.status) {
    const st = String(f.status).toUpperCase();
    rows = rows.filter((r) => String(r.status || "").toUpperCase() === st);
  }
  if (f.since) {
    const t = new Date(f.since).getTime();
    rows = rows.filter((r) => new Date(r.createdAt || 0).getTime() >= t);
  }
  if (f.intent) {
    const want = String(f.intent).toUpperCase();
    rows = rows.filter((r) => String(r.intent || "").toUpperCase() === want);
  }
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return rows.slice(0, f.limit ? Math.min(500, Number(f.limit) || 100) : 100);
}

function getIntakeById(id) {
  const p = String(id || "").trim();
  return readStore().find((r) => r.id === p) || null;
}

function getIntakeDashboardSnapshot() {
  const rows = readStore();
  const today = new Date().toISOString().slice(0, 10);
  const newToday = rows.filter((r) => String(r.createdAt || "").slice(0, 10) === today);
  const summary = {
    newCount: rows.filter((r) => String(r.status) === "NEW").length,
    needsInfoCount: rows.filter((r) => String(r.status) === "NEEDS_INFO").length,
    readyForQuoteCount: rows.filter((r) => String(r.status) === "READY_FOR_QUOTE").length,
    readyForJobCount: rows.filter((r) => String(r.status) === "READY_FOR_JOB").length,
    reviewRequiredCount: rows.filter((r) => String(r.status) === "REVIEW_REQUIRED").length,
    newTodayCount: newToday.length,
  };
  const recentInquiries = rows.slice(0, 25);
  const intakeReady = rows.filter((r) => /READY_FOR_QUOTE|READY_FOR_JOB/i.test(String(r.status || ""))).slice(0, 20);
  const intakeBlocked = rows.filter((r) => /NEEDS_INFO|REVIEW_REQUIRED/i.test(String(r.status || ""))).slice(0, 20);
  return {
    intakeSummary: summary,
    recentInquiries,
    intakeReady,
    intakeBlocked,
  };
}

async function ingestPipeline(opts) {
  const rawSource = String((opts && opts.source) || "MANUAL").toUpperCase();
  const source = ["EMAIL", "WEB", "MANUAL", "SMS"].includes(rawSource) ? rawSource : "MANUAL";
  const id = makeId();
  const rawSubject = String((opts && opts.subject) || "");
  const rawBody = String((opts && opts.body) || (opts && opts.notes) || "");
  const phone = String((opts && opts.phone) || "");
  const from = (opts && opts.from) || {};
  const customerNameExplicit = (opts && opts.customerName) || "";

  const raw = {
    subject: rawSubject,
    body: rawBody,
    from: typeof from === "object" ? from : {},
    customerName: customerNameExplicit,
  };

  let parsed;
  try {
    parsed = parseIntake(raw);
  } catch (_e) {
    parsed = {
      intent: "UNKNOWN",
      extractedData: {},
      missingFields: ["parse_error"],
      assumptions: ["parser_failed_use_raw"],
      reviewRequired: true,
    };
  }

  let enriched = {
    enriched: false,
    extractedData: parsed.extractedData || {},
    missingFields: parsed.missingFields || [],
    assumptions: parsed.assumptions || [],
    reviewRequired: parsed.reviewRequired,
  };
  try {
    enriched = await enrichParsedIntake(parsed, raw);
  } catch (_e) {
    /* keep heuristic */
  }

  let extracted = mergeExtracted(parsed.extractedData || {}, enriched.extractedData || {});
  const fromEmail = typeof from.email === "string" ? from.email.trim() : "";
  if (fromEmail) extracted.email = fromEmail.toLowerCase();
  if (phone) extracted.phone = phone;
  if (customerNameExplicit && !extracted.customerName) extracted.customerName = customerNameExplicit;

  const artInfo = detectArtFromIntake(raw, opts && opts.attachments);
  const linked = linkAttachmentsToIntake(id, normalizeAttachments(opts && opts.attachments));
  const artDetected = Boolean(artInfo.artDetected || linked.length > 0);
  const attachmentCount = linked.length || artInfo.attachmentCount || 0;

  let match = {
    customer: null,
    matchedBy: "NEW",
    confidence: 0,
    reviewRequired: false,
  };
  try {
    match = getOrCreateCustomer({
      name: extracted.customerName || from.name || customerNameExplicit,
      email: extracted.email || fromEmail,
      phone: extracted.phone || phone,
      company: extracted.company,
      notes: rawBody.slice(0, 2000),
    });
  } catch (_e) {
    /* leave unmatched */
  }

  let reorder = { reorderDetected: false, candidateJobs: [], confidence: 0 };
  try {
    const draft = {
      rawSubject,
      rawBody,
      extractedData: extracted,
      artDetected,
    };
    reorder = await detectReorderIntent(draft);
  } catch (_e) {
    /* ignore */
  }

  const recordDraft = {
    id,
    source,
    customerId: match.customer ? match.customer.id : null,
    rawSubject,
    rawBody,
    normalizedText: `${rawSubject}\n${rawBody}`.slice(0, 50000),
    intent: parsed.intent,
    status: "NEW",
    missingFields: Array.isArray(enriched.missingFields) && enriched.missingFields.length ? enriched.missingFields : parsed.missingFields || [],
    extractedData: extracted,
    assumptions: [...(parsed.assumptions || []), ...(enriched.assumptions || [])],
    artDetected,
    attachmentCount,
    attachmentsMeta: linked,
    reviewRequired: Boolean(
      parsed.reviewRequired || enriched.reviewRequired || match.reviewRequired || reorder.reorderDetected,
    ),
    customerMatch: {
      matchedBy: match.matchedBy,
      confidence: match.confidence,
      reviewRequired: match.reviewRequired,
    },
    reorder,
    mock: Boolean(opts && opts.mock),
  };

  if (reorder.reorderDetected && recordDraft.intent === "UNKNOWN") {
    recordDraft.intent = "REORDER";
  }

  const decision = decideNextStep(recordDraft);
  recordDraft.status = decision.status;
  recordDraft.nextAction = decision.nextAction;
  recordDraft.decisionReasons = decision.reasons;

  const saved = createIntakeRecord(recordDraft);

  await safeLog(`intake received ${id} source=${source}`);
  await safeLog(`intake parsed ${id} intent=${saved.intent} status=${saved.status}`);
  if (match.customer) await safeLog(`customer matched ${match.matchedBy} id=${match.customer.id}`);
  if (saved.missingFields && saved.missingFields.length) {
    await safeLog(`missing info ${id}: ${saved.missingFields.join(",")}`);
  }
  if (artDetected) await safeLog(`art detected ${id} attachments=${attachmentCount}`);

  return { success: true, intake: saved, mock: Boolean(opts && opts.mock) };
}

async function convertIntakeToJob(intakeId) {
  const rec = getIntakeById(intakeId);
  if (!rec) return { success: false, error: "intake_not_found" };
  const out = await convertParsedIntakeToJob(rec);
  if (out.success && out.job && out.job.jobId) {
    updateIntakeRecord(rec.id, {
      status: "CONVERTED",
      createdJobId: out.job.jobId,
    });
    await safeLog(`intake converted to job ${rec.id} → ${out.job.jobId}`);
  } else {
    await safeLog(`intake job convert failed ${rec.id} missing=${(out.missingFields || []).join(",")}`);
  }
  return { ...out, intakeStatus: out.success ? "CONVERTED" : rec.status };
}

function removeIntakeRecordsWhere(pred) {
  const list = readStore();
  const next = list.filter((r) => !pred(r));
  if (next.length === list.length) return 0;
  writeStore(next);
  return list.length - next.length;
}

async function convertIntakeToQuoteDraft(intakeId) {
  const rec = getIntakeById(intakeId);
  if (!rec) return { success: false, error: "intake_not_found" };
  const draft = buildQuoteDraftFromIntake(rec);
  const ref = `QTE-${rec.id}`;
  updateIntakeRecord(rec.id, {
    createdQuoteRef: ref,
    status: rec.status === "CONVERTED" ? rec.status : "READY_FOR_QUOTE",
  });
  await safeLog(`quote draft built for ${rec.id} ref=${ref}`);
  return { success: true, quoteDraft: draft, quoteRef: ref };
}

module.exports = {
  createIntakeRecord,
  updateIntakeRecord,
  getIntakeRecords,
  getIntakeById,
  convertIntakeToJob,
  convertIntakeToQuoteDraft,
  ingestPipeline,
  getIntakeDashboardSnapshot,
  readStore,
  removeIntakeRecordsWhere,
};
