"use strict";

function trim(n) {
  return String(process.env[n] || "").trim();
}

function isConfigured() {
  return Boolean(trim("GITHUB_TOKEN") || trim("GH_TOKEN"));
}

async function pingReadOnly() {
  if (!isConfigured()) {
    return { status: "NOT_CONFIGURED", missingEnvVars: ["GITHUB_TOKEN or GH_TOKEN"] };
  }
  return {
    status: "NOT_IMPLEMENTED",
    message: "Phase 1: GitHub connector stub — REST calls not implemented.",
  };
}

module.exports = { isConfigured, pingReadOnly };
