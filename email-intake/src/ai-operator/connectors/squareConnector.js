"use strict";

/**
 * Phase 1: read-only existence check against existing Cheeky env keys.
 * No Square API calls from this connector.
 */
function trim(n) {
  return String(process.env[n] || "").trim();
}

function isConfigured() {
  return Boolean(trim("SQUARE_ACCESS_TOKEN") && trim("SQUARE_LOCATION_ID"));
}

function missingEnvVars() {
  const m = [];
  if (!trim("SQUARE_ACCESS_TOKEN")) m.push("SQUARE_ACCESS_TOKEN");
  if (!trim("SQUARE_LOCATION_ID")) m.push("SQUARE_LOCATION_ID");
  return m;
}

async function pingReadOnly(/* _intent */) {
  if (!isConfigured()) {
    return { status: "NOT_CONFIGURED", missingEnvVars: missingEnvVars() };
  }
  return {
    status: "NOT_IMPLEMENTED",
    message: "Phase 1: Square operator connector does not invoke APIs yet.",
  };
}

module.exports = { isConfigured, missingEnvVars, pingReadOnly };
