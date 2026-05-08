"use strict";

const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;
const STORAGE_FILE = path.join(__dirname, "bridgeData", "events.jsonl");

function ensureBridgeDataDirSync() {
  try {
    fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * Persist one normalized event envelope; `persistedAt` + `schemaVersion` stored on disk only.
 *
 * @param {object} event — canonical bridge event
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function persistEvent(event) {
  try {
    const ensured = ensureBridgeDataDirSync();
    if (!ensured.ok) return ensured;
    const row = Object.assign({}, event && typeof event === "object" ? event : {}, {
      persistedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    });
    fs.appendFileSync(STORAGE_FILE, `${JSON.stringify(row)}\n`, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/** Remove durability-only fields before normalizing into the in-memory model (replay only). */
function stripPersistenceFields(record) {
  if (!record || typeof record !== "object") return null;
  /** @type {any} */
  const { persistedAt, schemaVersion, ...rest } = record;
  void persistedAt;
  void schemaVersion;
  return Object.keys(rest).length ? rest : null;
}

function loadPersistedEvents() {
  /** @type {object[]} */
  const out = [];
  let skippedLines = 0;

  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return { ok: true, events: [], skippedLines: 0 };
    }

    const text = fs.readFileSync(STORAGE_FILE, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln || !ln.trim()) continue;
      try {
        const parsed = JSON.parse(ln);
        if (parsed && typeof parsed === "object") out.push(parsed);
        else skippedLines++;
      } catch (_parseErr) {
        skippedLines++;
      }
    }

    return { ok: true, events: out, skippedLines };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [], skippedLines };
  }
}

function getPersistenceStats() {
  try {
    const load = loadPersistedEvents();
    /** @type {import("fs").Stats | null} */
    let st = null;
    try {
      if (fs.existsSync(STORAGE_FILE)) st = fs.statSync(STORAGE_FILE);
    } catch (_s) {
      st = null;
    }

    return {
      ok: true,
      storagePath: STORAGE_FILE,
      persistedEvents: load.ok ? load.events.length : 0,
      storageFileSizeBytes: st && typeof st.size === "number" ? st.size : 0,
      malformedLinesSkipped: typeof load.skippedLines === "number" ? load.skippedLines : 0,
      loadError: load.ok ? null : load.error || null,
    };
  } catch (e) {
    return {
      ok: false,
      storagePath: STORAGE_FILE,
      persistedEvents: 0,
      storageFileSizeBytes: 0,
      malformedLinesSkipped: 0,
      loadError: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  SCHEMA_VERSION,
  STORAGE_FILE,
  persistEvent,
  loadPersistedEvents,
  getPersistenceStats,
  stripPersistenceFields,
};
