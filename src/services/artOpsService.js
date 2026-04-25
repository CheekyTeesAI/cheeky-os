/**
 * Art operations v2 — file-backed registry + job/intake linkage.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { guessKind } = require("./intakeArtService");
const { addTimelineEvent } = require("./timelineService");
const { logInbound } = require("./inboundOpsLog");
const { updateJob, getJobById } = require("../data/store");
const { updateIntakeRecord, getIntakeById } = require("./intakeService");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "art-ops-store.json");

const STATUSES = [
  "UPLOADED",
  "REVIEW_NEEDED",
  "CUSTOMER_APPROVAL_NEEDED",
  "PRINT_READY",
  "REJECTED",
  "ARCHIVED",
];

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ version: 1, files: [] }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readFiles() {
  ensureFile();
  try {
    const doc = JSON.parse(fs.readFileSync(STORE, "utf8") || "{}");
    return Array.isArray(doc.files) ? doc.files : [];
  } catch (_e) {
    return [];
  }
}

function writeFiles(files) {
  ensureFile();
  try {
    fs.writeFileSync(STORE, JSON.stringify({ version: 1, files }, null, 2), "utf8");
  } catch (e) {
    console.warn("[artOpsService] write failed:", e && e.message ? e.message : e);
  }
}

function genArtId() {
  return `ART-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function classifyArtFile(file) {
  const f = file && typeof file === "object" ? file : {};
  const kind = guessKind(f.filename, f.mimeType || f.contentType);
  const isArt = kind === "ART";
  return {
    kind,
    isArt,
    confidence: isArt ? 0.9 : kind === "UNKNOWN" ? 0.3 : 0.5,
    reason: isArt ? "extension_or_mime" : "not_classified_as_art",
  };
}

/**
 * @param {"INTAKE"|"JOB"} entityType
 * @param {string} entityId
 * @param {{ filename: string, path?: string, mimeType?: string, source?: string }} file
 */
function attachArtToIntakeOrJob(entityType, entityId, file) {
  const et = String(entityType || "").toUpperCase();
  const eid = String(entityId || "").trim();
  const cls = classifyArtFile(file);
  const initialStatus = cls.isArt ? "REVIEW_NEEDED" : "UPLOADED";

  const row = {
    id: genArtId(),
    entityType: et,
    entityId: eid,
    filename: String(file.filename || path.basename(file.path || "file")).slice(0, 500),
    path: file.path ? String(file.path) : "",
    mimeType: String(file.mimeType || file.contentType || "application/octet-stream"),
    status: initialStatus,
    uploadedAt: new Date().toISOString(),
    notes: cls.isArt ? "" : "Not clearly art by extension — manual review.",
    classification: cls,
    source: String(file.source || "MANUAL").toUpperCase(),
  };

  const list = readFiles();
  list.push(row);
  writeFiles(list);

  if (et === "JOB" && eid) {
    const job = getJobById(eid);
    const prev = (job && Array.isArray(job.artFiles) ? job.artFiles : []).slice();
    prev.push({
      artFileId: row.id,
      filename: row.filename,
      path: row.path,
      status: row.status,
    });
    updateJob(eid, { artFiles: prev, hasArt: true });
  }
  if (et === "INTAKE" && eid) {
    const rec = getIntakeById(eid);
    const ex = (rec && rec.extractedData && typeof rec.extractedData === "object" ? rec.extractedData : {}) || {};
    const artList = Array.isArray(ex.artFiles) ? ex.artFiles.slice() : [];
    artList.push({ artFileId: row.id, filename: row.filename, path: row.path, status: row.status });
    updateIntakeRecord(eid, {
      extractedData: { ...ex, artFiles: artList },
      artDetected: true,
    });
  }

  const tl = addTimelineEvent({
    relatedType: et === "JOB" ? "JOB" : "INTAKE",
    relatedId: eid,
    customerId: null,
    channel: file.source === "EMAIL" ? "EMAIL" : "UPLOAD",
    eventType: "ART_FILE",
    title: `Art file: ${row.filename}`,
    summary: `Status ${row.status}. ${cls.isArt ? "Classified as art." : "Needs manual classification."}`,
    rawRefId: row.id,
    metadata: { artFileId: row.id, classification: cls },
  });
  logInbound("art_linked", { artFileId: row.id, entityType: et, entityId: eid });
  logInbound("timeline_event_created", { timelineId: tl.id });

  return row;
}

function updateArtStatus(artFileId, status) {
  const id = String(artFileId || "").trim();
  const st = String(status || "").toUpperCase();
  if (!STATUSES.includes(st)) return null;
  const list = readFiles();
  const idx = list.findIndex((r) => r && r.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], status: st, updatedAt: new Date().toISOString() };
  writeFiles(list);
  logInbound("art_status_changed", { artFileId: id, status: st });
  addTimelineEvent({
    relatedType: list[idx].entityType,
    relatedId: list[idx].entityId,
    channel: "SYSTEM",
    eventType: "ART_STATUS",
    title: `Art ${st}`,
    summary: list[idx].filename,
    rawRefId: id,
    metadata: { artFileId: id, status: st },
  });
  return list[idx];
}

function getArtQueue() {
  return readFiles().sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
}

module.exports = {
  classifyArtFile,
  attachArtToIntakeOrJob,
  updateArtStatus,
  getArtQueue,
  STATUSES,
};
