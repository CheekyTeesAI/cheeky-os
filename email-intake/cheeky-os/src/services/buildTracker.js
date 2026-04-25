"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const actionAudit = require("../operator/actionAudit");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "flow-builds.json");

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { builds: [] };
    }
    const text = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.builds)) return { builds: [] };
    return { builds: parsed.builds };
  } catch (_) {
    return { builds: [] };
  }
}

function writeStore(store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify({ builds: store.builds }, null, 2) + "\n", "utf8");
}

function createBuildRecord(manifest) {
  const m = manifest || {};
  const id = `bld-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const rec = {
    id,
    status: "proposed",
    manifest: m,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.builds.push(rec);
  writeStore(store);
  actionAudit({
    type: "FLOW_BUILDER",
    event: "build_proposed",
    buildId: id,
    intent: m.intent,
  });
  return rec;
}

function updateBuildStatus(id, status) {
  const allowed = new Set(["proposed", "approved", "building", "built", "verified", "failed"]);
  const s = String(status || "").toLowerCase();
  if (!allowed.has(s)) return null;
  const store = readStore();
  const idx = store.builds.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  store.builds[idx] = {
    ...store.builds[idx],
    status: s,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  actionAudit({
    type: "FLOW_BUILDER",
    event: "build_status",
    buildId: id,
    status: s,
  });
  return store.builds[idx];
}

function getBuildStatus(id) {
  const store = readStore();
  return store.builds.find((b) => b.id === id) || null;
}

module.exports = {
  createBuildRecord,
  updateBuildStatus,
  getBuildStatus,
};
