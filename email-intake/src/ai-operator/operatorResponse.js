"use strict";

/**
 * Standard operator HTTP/programmatic envelope (Phase 1 v3).
 */

function ok(data = {}, meta = {}) {
  return {
    ok: true,
    data: data !== null && typeof data === "object" ? data : {},
    meta: meta !== null && typeof meta === "object" ? meta : {},
  };
}

function err(code, message) {
  return {
    ok: false,
    error: {
      code: String(code || "OPERATOR_ERROR"),
      message: String(message || "Operator error."),
    },
  };
}

module.exports = { ok, err };
