"use strict";

function trim(n) {
  return String(process.env[n] || "").trim();
}

function isConfigured() {
  return Boolean(trim("OPENAI_API_KEY"));
}

function missingEnvVars() {
  return trim("OPENAI_API_KEY") ? [] : ["OPENAI_API_KEY"];
}

/** Phase 1: no completions from this connector — tooling uses shared env readiness only */
async function healthCheck() {
  if (!isConfigured()) {
    return { status: "NOT_CONFIGURED", missingEnvVars: missingEnvVars() };
  }
  return {
    status: "NOT_IMPLEMENTED",
    message:
      "openaiConnector Phase 1 stub: OPENAI_API_KEY present; operator-mediated model calls belong in dedicated tools.",
  };
}

module.exports = { isConfigured, missingEnvVars, healthCheck };
