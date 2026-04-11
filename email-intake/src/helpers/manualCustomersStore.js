/**
 * File-backed manual customer store with merge/dedupe helpers.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function manualPath() {
  return path.join(__dirname, "..", "..", "data", "manual-customers.json");
}

function ensureFile() {
  const p = manualPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify({ updatedAt: new Date().toISOString(), items: [] }, null, 2), "utf8");
  }
}

function readManual() {
  ensureFile();
  try {
    const raw = fs.readFileSync(manualPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (_e) {
    return [];
  }
}

function writeManual(items) {
  ensureFile();
  fs.writeFileSync(
    manualPath(),
    JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2),
    "utf8"
  );
}

function dedupeByEmail(items) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const email = String((it && it.email) || "").trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(it);
  }
  return out;
}

function upsertManualMany(incoming) {
  const current = readManual();
  const merged = dedupeByEmail([...(incoming || []), ...current]);
  writeManual(merged);
  return merged;
}

module.exports = { manualPath, readManual, upsertManualMany, dedupeByEmail };
