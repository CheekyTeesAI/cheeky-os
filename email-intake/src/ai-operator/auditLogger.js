"use strict";

function safeStringify(payload) {
  try {
    return JSON.stringify(payload);
  } catch (_e) {
    return "{}";
  }
}

/**
 * Must never throw — auditing must not derail execution.
 *
 * Canonical fields when available: timestamp, intent, tool, params, durationMs, success, error
 */
function logOperatorAction(entry) {
  try {
    const iso = new Date().toISOString();
    const line = Object.assign(
      {
        timestamp: iso,
        ts: iso,
        sink: "console",
        kind: "ai-operator-audit",
        error: undefined,
      },
      entry
    );

    console.log("[ai-operator-audit]", safeStringify(line));
  } catch (logErr) {
    console.warn(
      "[ai-operator-audit] logger_failed:",
      logErr && logErr.message ? logErr.message : String(logErr)
    );
  }
}

module.exports = { logOperatorAction };
