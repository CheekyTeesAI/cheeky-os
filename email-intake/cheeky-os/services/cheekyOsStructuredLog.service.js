"use strict";

/**
 * CHEEKY OS v4.1 — JSON-lines structured log helper (additive).
 *
 * CHEEKY_LOG_JSON_FILE=log/cheeky-os-events.jsonl  (relative to email-intake/ or absolute)
 * CHEEKY_LOG_JSON_CONSOLE=true                       — duplicate each line as JSON stdout
 */

const fs = require("fs");
const path = require("path");

function baseRoot() {
  return path.join(__dirname, "..", ".."); // email-intake
}

function sinkEnabled() {
  const f = String(process.env.CHEEKY_LOG_JSON_FILE || "").trim();
  const c = String(process.env.CHEEKY_LOG_JSON_CONSOLE || "").match(/^(1|true|on|yes)$/i);
  return !!f || !!c;
}

function initCheekyOsStructuredLog() {
  const fileRel = String(process.env.CHEEKY_LOG_JSON_FILE || "").trim();
  if (!fileRel) return;
  try {
    const abs = path.isAbsolute(fileRel) ? fileRel : path.join(baseRoot(), fileRel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
  } catch (_) {
    /* best-effort */
  }
}

function logStructured(topic, payload) {
  if (!sinkEnabled()) return;
  const rec = {
    ts: new Date().toISOString(),
    svc: "cheeky-os",
    topic,
    ...(payload && typeof payload === "object" ? payload : { detail: payload }),
  };
  const line = JSON.stringify(rec) + "\n";
  try {
    const fileRel = String(process.env.CHEEKY_LOG_JSON_FILE || "").trim();
    if (fileRel) {
      const abs = path.isAbsolute(fileRel) ? fileRel : path.join(baseRoot(), fileRel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.appendFileSync(abs, line);
    }
    if (String(process.env.CHEEKY_LOG_JSON_CONSOLE || "").match(/^(1|true|on|yes)$/i)) {
      console.log(JSON.stringify(rec));
    }
  } catch (e) {
    console.warn("[structured-log] write failed:", e && e.message ? e.message : e);
  }
}

module.exports = {
  initCheekyOsStructuredLog,
  logStructured,
};
