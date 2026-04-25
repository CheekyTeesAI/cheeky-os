/**
 * Social posts — persisted with status, queue, timestamps (v2).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "social-content-store.json");

function genId() {
  return `soc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeStatus(s) {
  const u = String(s || "").toUpperCase();
  const map = {
    PENDING: "DRAFT",
    DRAFT: "DRAFT",
    APPROVED: "APPROVED",
    POSTED: "POSTED",
    SKIPPED: "SKIPPED",
    REJECTED: "REJECTED",
    EDIT_REQUESTED: "EDIT_REQUESTED",
    posted: "POSTED",
    skipped: "SKIPPED",
    pending: "DRAFT",
  };
  return map[u] || map[s] || "DRAFT";
}

function migrateDoc(raw) {
  const doc = raw && typeof raw === "object" ? raw : {};
  const ver = doc.version || 1;
  const posts = Array.isArray(doc.posts) ? doc.posts : [];
  for (const p of posts) {
    if (!p || typeof p !== "object") continue;
    p.status = normalizeStatus(p.status);
    if (p.payload && typeof p.payload === "object" && p.payload.status) {
      p.payload.status = normalizeStatus(p.payload.status);
    }
    if (p.queued === undefined) p.queued = false;
  }
  return {
    version: ver >= 2 ? ver : 2,
    posts,
    queue: Array.isArray(doc.queue) ? doc.queue : [],
    reminder:
      doc.reminder && typeof doc.reminder === "object"
        ? { lastReminderSentOn: doc.reminder.lastReminderSentOn || null }
        : { lastReminderSentOn: null },
  };
}

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      fs.writeFileSync(
        FILE,
        JSON.stringify({ version: 2, posts: [], queue: [], reminder: { lastReminderSentOn: null } }, null, 2),
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
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8") || "{}");
    const doc = migrateDoc(raw);
    return doc;
  } catch (_e) {
    return { version: 2, posts: [], queue: [], reminder: { lastReminderSentOn: null } };
  }
}

function writeDoc(doc) {
  ensureFile();
  try {
    fs.writeFileSync(FILE, JSON.stringify(doc, null, 2), "utf8");
  } catch (e) {
    console.warn("[contentStore] write failed:", e && e.message ? e.message : e);
  }
}

/**
 * Create or replace today's generated post payload.
 * @param {{ payload: object, date?: string, status?: string, id?: string }} row
 */
function createPost(row) {
  const doc = readDoc();
  const date = String(row.date || row.payload?.date || todayIsoDate());
  const id = row.id || row.payload?.id || genId();
  const status = normalizeStatus(row.status || row.payload?.status || "DRAFT");
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload, id, date, status } : { id, date, status };

  const idx = doc.posts.findIndex((p) => p && p.date === date);
  const now = new Date().toISOString();
  const entry = {
    id,
    date,
    status,
    queued: false,
    queuedAt: null,
    createdAt: now,
    updatedAt: now,
    postedAt: null,
    isDemo: Boolean(row.isDemo),
    payload,
  };

  if (idx >= 0) {
    const prev = doc.posts[idx];
    entry.createdAt = prev.createdAt || entry.createdAt;
    entry.queued = prev.queued || false;
    entry.queuedAt = prev.queuedAt || null;
    entry.postedAt = prev.postedAt || null;
    doc.posts[idx] = { ...prev, ...entry, payload: { ...prev.payload, ...payload } };
  } else {
    doc.posts.push(entry);
  }
  writeDoc(doc);
  return doc.posts.find((p) => p.id === id) || entry;
}

function getPostById(id) {
  const doc = readDoc();
  return doc.posts.find((p) => p && p.id === String(id)) || null;
}

function getTodayPost() {
  const doc = readDoc();
  const d = todayIsoDate();
  return doc.posts.find((p) => p && p.date === d) || null;
}

function getQueuedPosts() {
  const doc = readDoc();
  const out = [];
  for (const qid of doc.queue) {
    const p = doc.posts.find((x) => x && x.id === String(qid));
    if (p) out.push(p);
  }
  return out;
}

function markApproved(postId) {
  return setPostStatus(postId, "APPROVED");
}

function markPosted(postId) {
  const doc = readDoc();
  const i = doc.posts.findIndex((p) => p && p.id === String(postId));
  if (i < 0) return null;
  const now = new Date().toISOString();
  doc.posts[i].status = "POSTED";
  doc.posts[i].updatedAt = now;
  doc.posts[i].postedAt = now;
  doc.posts[i].queued = false;
  doc.posts[i].payload = { ...doc.posts[i].payload, status: "POSTED" };
  doc.queue = doc.queue.filter((id) => id !== String(postId));
  writeDoc(doc);
  return doc.posts[i];
}

function skipPost(postId) {
  return setPostStatus(postId, "SKIPPED");
}

function setPostStatus(postId, status) {
  const doc = readDoc();
  const i = doc.posts.findIndex((p) => p && p.id === String(postId));
  if (i < 0) return null;
  const now = new Date().toISOString();
  const st = normalizeStatus(status);
  doc.posts[i].status = st;
  doc.posts[i].updatedAt = now;
  doc.posts[i].payload = { ...doc.posts[i].payload, status: st };
  if (st !== "APPROVED") {
    doc.posts[i].queued = false;
    doc.queue = doc.queue.filter((id) => id !== String(postId));
  }
  writeDoc(doc);
  return doc.posts[i];
}

/** @deprecated */
function savePost(row) {
  return createPost({
    ...row,
    status: row.status === "pending" ? "DRAFT" : row.status,
  });
}

/** Pending / draft backlog for reuse */
function getUnusedPosts() {
  const doc = readDoc();
  return doc.posts.filter((p) => p && (p.status === "DRAFT" || p.status === "EDIT_REQUESTED"));
}

/** @deprecated */
function markStatus(postId, status) {
  const s = String(status).toLowerCase();
  if (s === "posted") return markPosted(postId);
  if (s === "skipped") return skipPost(postId);
  return setPostStatus(postId, status);
}

function getReminderState() {
  return readDoc().reminder;
}

function setReminderSent(isoDate) {
  const doc = readDoc();
  doc.reminder = doc.reminder || {};
  doc.reminder.lastReminderSentOn = isoDate;
  writeDoc(doc);
}

function listHistory(limit) {
  const doc = readDoc();
  const n = Math.min(100, Math.max(1, Number(limit) || 40));
  return doc.posts
    .filter((p) => p && p.status === "POSTED")
    .sort((a, b) => String(b.postedAt || b.updatedAt).localeCompare(String(a.postedAt || a.updatedAt)))
    .slice(0, n);
}

function enqueuePost(postId) {
  const doc = readDoc();
  const p = doc.posts.find((x) => x && x.id === String(postId));
  if (!p || p.status !== "APPROVED") return { ok: false, error: "only_approved_can_queue" };
  if (!doc.queue.includes(String(postId))) doc.queue.push(String(postId));
  const i = doc.posts.findIndex((x) => x && x.id === String(postId));
  if (i >= 0) {
    doc.posts[i].queued = true;
    doc.posts[i].queuedAt = new Date().toISOString();
  }
  writeDoc(doc);
  return { ok: true, post: doc.posts[i] };
}

function dequeuePost() {
  const doc = readDoc();
  const id = doc.queue.shift();
  if (!id) return null;
  const i = doc.posts.findIndex((x) => x && x.id === String(id));
  if (i >= 0) {
    doc.posts[i].queued = false;
  }
  writeDoc(doc);
  return getPostById(id);
}

/** Remove a post only when flagged demo (training data). */
function deletePostByIdIfDemo(postId) {
  const doc = readDoc();
  const id = String(postId || "").trim();
  const i = doc.posts.findIndex((p) => p && p.id === id);
  if (i < 0) return false;
  const p = doc.posts[i];
  const demo = p.isDemo === true || (p.payload && p.payload.isDemo === true);
  if (!demo) return false;
  doc.posts.splice(i, 1);
  doc.queue = (doc.queue || []).filter((q) => String(q) !== id);
  writeDoc(doc);
  return true;
}

module.exports = {
  createPost,
  savePost,
  getTodayPost,
  getPostById,
  getQueuedPosts,
  getUnusedPosts,
  markApproved,
  markPosted,
  skipPost,
  setPostStatus,
  markStatus,
  getReminderState,
  setReminderSent,
  listHistory,
  enqueuePost,
  dequeuePost,
  readDoc,
  normalizeStatus,
  deletePostByIdIfDemo,
};
