"use strict";

/**
 * Lightweight JSON persistence for runtime queues (survive restarts; no Prisma migration).
 * Directory: email-intake/cheeky-os/data/runtime/
 */

const fs = require("fs");
const path = require("path");

const RUNTIME_DIR = path.join(__dirname, "..", "data", "runtime");

function ensureDir() {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  } catch (_) {}
}

function loadJson(fileName, fallback) {
  try {
    ensureDir();
    const p = path.join(RUNTIME_DIR, fileName);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    console.warn("[json.queue.persistence] load failed:", fileName, err && err.message ? err.message : err);
    return fallback;
  }
}

function saveJson(fileName, data) {
  try {
    ensureDir();
    const p = path.join(RUNTIME_DIR, fileName);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("[json.queue.persistence] save failed:", fileName, err && err.message ? err.message : err);
  }
}

function appendJson(fileName, entry) {
  try {
    const arr = loadJson(fileName, []);
    const list = Array.isArray(arr) ? arr : [];
    list.push(entry);
    saveJson(fileName, list);
  } catch (err) {
    console.warn("[json.queue.persistence] append failed:", fileName, err && err.message ? err.message : err);
  }
}

module.exports = {
  loadJson,
  saveJson,
  appendJson,
  RUNTIME_DIR,
};
