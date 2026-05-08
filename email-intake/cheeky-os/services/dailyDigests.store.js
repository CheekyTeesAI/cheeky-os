"use strict";

/**
 * JSON persistence for daily digests (no Prisma migration).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "daily-digests.json");
const MAX_ENTRIES = 90;

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadRaw() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.entries)) return { entries: [] };
    return j;
  } catch {
    return { entries: [] };
  }
}

function saveRaw(data) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function digestDateKeyNY(d = new Date()) {
  try {
    const s = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return String(s).slice(0, 10);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * @returns {{ entries: object[] }}
 */
function listRecent(limit) {
  const data = loadRaw();
  const n = Math.max(1, Math.min(Number(limit) || 30, MAX_ENTRIES));
  const sorted = [...(data.entries || [])].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  return sorted.slice(0, n);
}

function getByDigestDate(digestDate) {
  const key = String(digestDate || "").trim();
  if (!key) return null;
  const data = loadRaw();
  const hit = (data.entries || []).filter((e) => e.digestDate === key);
  if (!hit.length) return null;
  hit.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return hit[0];
}

function getLatestAny() {
  const data = loadRaw();
  const sorted = [...(data.entries || [])].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  return sorted[0] || null;
}

/**
 * @param {object} params
 * @param {string} params.digestDate
 * @param {string} params.headline
 * @param {object} params.payload
 * @param {string} params.mode
 * @param {string|null} params.sentAt
 * @param {number} [params.topPriorityCount]
 * @param {number} [params.riskCount]
 */
function saveEntry(params) {
  const digestDate = String(params.digestDate || "").trim();
  const headline = String(params.headline || "").trim() || "Daily digest";
  const payload = params.payload && typeof params.payload === "object" ? params.payload : {};
  const mode = String(params.mode || "deterministic").trim();
  const sentAt = params.sentAt != null ? params.sentAt : null;
  const topPriorityCount =
    params.topPriorityCount != null
      ? Number(params.topPriorityCount)
      : Array.isArray(payload.topPriorities)
        ? payload.topPriorities.length
        : 0;
  const riskCount =
    params.riskCount != null
      ? Number(params.riskCount)
      : Array.isArray(payload.risks)
        ? payload.risks.length
        : 0;

  const data = loadRaw();
  const entries = data.entries || [];
  const now = new Date().toISOString();
  const filtered = entries.filter((e) => e.digestDate !== digestDate);
  const row = {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "dg-" + crypto.randomBytes(12).toString("hex"),
    digestDate,
    headline,
    payloadJson: payload,
    mode,
    sentAt,
    topPriorityCount,
    riskCount,
    createdAt: now,
    updatedAt: now,
  };
  filtered.push(row);
  filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  saveRaw({ entries: filtered.slice(0, MAX_ENTRIES) });
  return row;
}

function updateSentAt(id, sentAt) {
  const data = loadRaw();
  const entries = data.entries || [];
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) return null;
  entries[i] = {
    ...entries[i],
    sentAt: sentAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveRaw({ entries });
  return entries[i];
}

module.exports = {
  DATA_FILE,
  digestDateKeyNY,
  listRecent,
  getByDigestDate,
  getLatestAny,
  saveEntry,
  updateSentAt,
};
