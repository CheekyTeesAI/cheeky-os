"use strict";

function isConfigured() {
  return false;
}

async function pingReadOnly() {
  return {
    status: "NOT_CONFIGURED",
    missingEnvVars: [],
    message:
      "Phase 1: calendar connector placeholder. Prefer Microsoft Graph shared mailbox vars for email until calendar scope is defined.",
  };
}

module.exports = { isConfigured, pingReadOnly };
