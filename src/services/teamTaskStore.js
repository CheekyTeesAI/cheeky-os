/**
 * Persistent team task assignments + job flags (additive; not Prisma).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "team-execution.json");

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(
        STORE,
        JSON.stringify({ version: 1, assignments: [], completedToday: [], jobFlags: {} }, null, 2),
        "utf8"
      );
    }
  } catch (_e) {
    /* ignore */
  }
}

function readDoc() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return {
      version: doc.version || 1,
      assignments: Array.isArray(doc.assignments) ? doc.assignments : [],
      completedToday: Array.isArray(doc.completedToday) ? doc.completedToday : [],
      jobFlags: doc.jobFlags && typeof doc.jobFlags === "object" ? doc.jobFlags : {},
    };
  } catch (_e) {
    return { version: 1, assignments: [], completedToday: [], jobFlags: {} };
  }
}

function writeDoc(doc) {
  ensureFile();
  try {
    fs.writeFileSync(STORE, JSON.stringify(doc, null, 2), "utf8");
  } catch (e) {
    console.warn("[teamTaskStore] write failed:", e && e.message ? e.message : e);
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pruneCompletedToday(list) {
  const day = todayIso();
  return (list || []).filter((x) => x && String(x.day || "") === day);
}

function upsertAssignments(rows) {
  const doc = readDoc();
  const byId = new Map(doc.assignments.map((a) => [a.taskId, a]));
  for (const r of rows) {
    if (!r || !r.taskId) continue;
    const prev = byId.get(r.taskId) || {};
    byId.set(r.taskId, { ...prev, ...r, updatedAt: new Date().toISOString() });
  }
  doc.assignments = Array.from(byId.values());
  writeDoc(doc);
  return doc.assignments;
}

function getAssignments() {
  const doc = readDoc();
  return doc.assignments;
}

function getAssignment(taskId) {
  const id = String(taskId || "").trim();
  return getAssignments().find((a) => a.taskId === id) || null;
}

function setJobFlag(jobId, patch) {
  const doc = readDoc();
  const j = String(jobId || "").trim();
  if (!j) return;
  doc.jobFlags[j] = { ...(doc.jobFlags[j] || {}), ...patch };
  writeDoc(doc);
}

function getJobFlag(jobId) {
  const doc = readDoc();
  return doc.jobFlags[String(jobId || "")] || {};
}

function recordCompletedToday(taskId, jobId) {
  const doc = readDoc();
  doc.completedToday = pruneCompletedToday(doc.completedToday);
  doc.completedToday.push({
    taskId,
    jobId,
    day: todayIso(),
    at: new Date().toISOString(),
  });
  writeDoc(doc);
}

function getCompletedToday() {
  const doc = readDoc();
  return pruneCompletedToday(doc.completedToday);
}

function stableTaskId(jobId, taskName, order) {
  const h = crypto.createHash("sha1").update(`${jobId}|${taskName}|${order}`).digest("hex").slice(0, 10);
  return `TT-${String(jobId).replace(/[^a-z0-9-]/gi, "")}-${h}`;
}

function removeAssignmentsWhere(pred) {
  const doc = readDoc();
  const before = doc.assignments.length;
  doc.assignments = doc.assignments.filter((a) => !pred(a));
  if (doc.assignments.length === before) return 0;
  writeDoc(doc);
  return before - doc.assignments.length;
}

module.exports = {
  readDoc,
  upsertAssignments,
  getAssignments,
  getAssignment,
  setJobFlag,
  getJobFlag,
  recordCompletedToday,
  getCompletedToday,
  pruneCompletedToday,
  stableTaskId,
  removeAssignmentsWhere,
};
