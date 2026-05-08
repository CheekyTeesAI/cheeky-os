"use strict";

const path = require("path");

/** Phase 1: filesystem access is gated — no destructive operations. */

function isConfigured() {
  return false;
}

async function pingReadOnly() {
  return {
    status: "NOT_CONFIGURED",
    missingEnvVars: [],
    message: `Phase 1: filesystem connector disabled until scoped read paths are approved (cwd=${path.resolve(process.cwd())}).`,
  };
}

module.exports = { isConfigured, pingReadOnly };
