"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Ensure /data exists and core JSON files exist (initialized to []).
 */
function ensureDataFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    for (const name of [
      "tasks.json",
      "events.json",
      "intake.json",
      "estimates.json",
      "orders.json",
    ]) {
      const full = path.join(DATA_DIR, name);
      if (!fs.existsSync(full)) {
        fs.writeFileSync(full, "[]", "utf8");
      }
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[dataStore] ensureDataFiles:", e.message);
  }
}

/**
 * @param {string} file basename e.g. tasks.json
 * @param {unknown} fallback
 * @returns {unknown}
 */
function readJson(file, fallback) {
  try {
    ensureDataFiles();
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    const raw = fs.readFileSync(full, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} file
 * @param {unknown} data
 * @returns {boolean}
 */
function writeJson(file, data) {
  try {
    ensureDataFiles();
    const full = path.join(DATA_DIR, file);
    fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[dataStore] writeJson", file, e.message);
    return false;
  }
}

/**
 * Append one item to a JSON array file.
 * @param {string} file
 * @param {unknown} item
 * @returns {boolean}
 */
function appendJson(file, item) {
  try {
    const arr = readJson(file, []);
    if (!Array.isArray(arr)) {
      return writeJson(file, [item]);
    }
    arr.push(item);
    return writeJson(file, arr);
  } catch {
    return false;
  }
}

module.exports = {
  ensureDataFiles,
  readJson,
  writeJson,
  appendJson,
  DATA_DIR,
};
