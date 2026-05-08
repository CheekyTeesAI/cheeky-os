"use strict";

/** Phase 1 placeholder — operational truth lives in Dataverse; wire in a later phase. */

function trim(n) {
  return String(process.env[n] || "").trim();
}

function isConfigured() {
  return Boolean(trim("CHEEKY_DATAVERSE_PROFILE"));
}

async function pingReadOnly() {
  if (!isConfigured()) {
    return {
      status: "NOT_CONFIGURED",
      missingEnvVars: ["CHEEKY_DATAVERSE_PROFILE"],
    };
  }
  return {
    status: "NOT_IMPLEMENTED",
    message: "Phase 1: Dataverse/query connector stubs only — no live queries.",
  };
}

module.exports = { isConfigured, pingReadOnly };
