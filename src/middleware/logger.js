"use strict";

/**
 * Cheeky OS v3.2 — lightweight request + error logging (CommonJS).
 */

function logError(scope, err) {
  const stack = err && err.stack ? err.stack : String(err);
  console.error(`[CHEEKY-OS v3.2][${scope}]`, stack);
}

function requestLogger(req, res, next) {
  try {
    console.log(
      `[CHEEKY-OS v3.2] ${req.method} ${req.originalUrl} id=${req.headers["x-request-id"] || "-"}`
    );
    next();
  } catch (e) {
    logError("requestLogger", e);
    next();
  }
}

module.exports = {
  logError,
  requestLogger,
};
