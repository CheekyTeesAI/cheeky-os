"use strict";

/**
 * Lightweight time clock — JSON persistence (additive, no Prisma required).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const FILE_PATH = path.join(DATA_DIR, "time-entries.json");

const CATEGORIES = new Set([
  "Production",
  "Overhead Work",
  "Break",
  "Projects",
  "Other",
]);

function ensureFile() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, JSON.stringify({ entries: [] }, null, 0), "utf8");
    }
  } catch (_e) {
    /* noop */
  }
}

function readStore() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const j = JSON.parse(raw);
    if (!j.entries || !Array.isArray(j.entries)) return { entries: [] };
    return j;
  } catch (_e) {
    return { entries: [] };
  }
}

function writeStore(store) {
  ensureFile();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf8");
    return true;
  } catch (_e) {
    return false;
  }
}

function normalizeCategory(c) {
  const s = String(c || "").trim();
  return CATEGORIES.has(s) ? s : "Other";
}

/**
 * @param {{ employeeName: string, category: string, orderId?: string, note?: string }} p
 */
function clockIn(p) {
  const employeeName = String(p.employeeName || "").trim();
  if (!employeeName) return { ok: false, error: "employeeName required" };

  const store = readStore();
  const open = store.entries.find(
    (e) => e && !e.clockOutAt && String(e.employeeName).trim() === employeeName
  );
  if (open) {
    return { ok: false, error: "already_clocked_in", entry: open };
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    employeeName,
    category: normalizeCategory(p.category),
    clockInAt: now,
    clockOutAt: null,
    minutes: null,
    note: typeof p.note === "string" ? p.note.slice(0, 2000) : "",
    orderId: p.orderId && String(p.orderId).trim() ? String(p.orderId).trim() : null,
    createdAt: now,
    updatedAt: now,
  };
  store.entries.push(entry);
  if (!writeStore(store)) return { ok: false, error: "persist_failed" };
  console.log(`[time] CLOCK IN employee=${employeeName} category=${entry.category}`);
  return { ok: true, entry };
}

/**
 * @param {{ employeeName: string, note?: string }} p
 */
function clockOut(p) {
  const employeeName = String(p.employeeName || "").trim();
  if (!employeeName) return { ok: false, error: "employeeName required" };

  const store = readStore();
  const idx = store.entries.findIndex(
    (e) => e && !e.clockOutAt && String(e.employeeName).trim() === employeeName
  );
  if (idx < 0) {
    return { ok: false, error: "no_active_clock_in" };
  }

  const entry = store.entries[idx];
  const outIso = new Date().toISOString();
  const start = new Date(entry.clockInAt).getTime();
  const end = new Date(outIso).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60000));

  entry.clockOutAt = outIso;
  entry.minutes = minutes;
  entry.updatedAt = outIso;
  if (typeof p.note === "string" && p.note.trim()) {
    entry.note = String(entry.note || "") + " | out: " + p.note.trim().slice(0, 500);
  }

  if (!writeStore(store)) return { ok: false, error: "persist_failed" };
  console.log(`[time] CLOCK OUT employee=${employeeName} minutes=${minutes}`);
  return { ok: true, entry, minutes };
}

function getStatus(employeeName) {
  const name = String(employeeName || "").trim();
  if (!name) return { ok: true, active: false, entry: null };
  const store = readStore();
  const entry = store.entries.find(
    (e) => e && !e.clockOutAt && String(e.employeeName).trim() === name
  );
  return { ok: true, active: !!entry, entry: entry || null };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getTodaySummary(employeeName) {
  const name = String(employeeName || "").trim();
  const store = readStore();
  const t0 = startOfToday();
  let totalMinutes = 0;
  const entries = [];
  for (const e of store.entries) {
    if (!e || String(e.employeeName).trim() !== name) continue;
    const closedMin = typeof e.minutes === "number" ? e.minutes : 0;
    if (e.clockOutAt) {
      const day = new Date(e.clockOutAt).getTime();
      if (day >= t0) totalMinutes += closedMin;
      if (day >= t0) entries.push(e);
    } else {
      entries.push(e);
      const start = new Date(e.clockInAt).getTime();
      totalMinutes += Math.max(0, Math.round((Date.now() - start) / 60000));
    }
  }
  return {
    ok: true,
    employeeName: name || null,
    totalMinutes,
    hoursApprox: Math.round((totalMinutes / 60) * 100) / 100,
    entries: entries.filter((e) => {
      const ref = e.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now();
      return ref >= t0 || !e.clockOutAt;
    }),
  };
}

module.exports = {
  clockIn,
  clockOut,
  getStatus,
  getTodaySummary,
  CATEGORIES: Array.from(CATEGORIES),
};
