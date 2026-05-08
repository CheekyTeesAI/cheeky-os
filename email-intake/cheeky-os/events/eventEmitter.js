"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const eventRegistry = require("./eventRegistry");

const EXPANDED_FILE = path.join(taskQueue.DATA_DIR, "events-expanded.jsonl");

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `evt-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  } catch (_e) {
    return `evt-${Date.now()}`;
  }
}

/**
 * Validates and appends one JSONL row. Fail-closed when invalid or I/O fails.
 *
 * @param {object} evt
 * @returns {{ ok: boolean, id?: string, error?: string, validation?: object }}
 */
function appendExpandedEvent(evt) {
  try {
    const v = eventRegistry.validateEvent(evt);
    if (!v.ok) {
      return { ok: false, error: "validation_failed", validation: v };
    }
    taskQueue.ensureDirAndFiles();
    const id = evt.id ? String(evt.id) : newId();
    const row = Object.assign({}, evt, {
      id,
      emittedAt: new Date().toISOString(),
      type: String(evt.type || evt.eventType || "").trim(),
    });
    if (row.eventType != null) delete row.eventType;
    fs.appendFileSync(EXPANDED_FILE, `${JSON.stringify(row)}\n`, "utf8");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  EXPANDED_FILE,
  appendExpandedEvent,
};
