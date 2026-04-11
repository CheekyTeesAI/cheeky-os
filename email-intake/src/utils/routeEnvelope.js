/**
 * Response envelope helper for route consistency.
 */
"use strict";

function ok(stage, data) {
  return { ok: true, success: true, stage, data: data || null, error: null };
}

function fail(stage, error, data) {
  return {
    ok: false,
    success: false,
    stage,
    data: data || null,
    error: typeof error === "string" ? error : String(error)
  };
}

module.exports = { ok, fail };
