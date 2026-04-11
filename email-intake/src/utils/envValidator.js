/**
 * Environment validator for safe startup warnings.
 */
"use strict";

function validateEnv() {
  const required = ["API_KEY"];
  const optionalWarn = ["OUTREACH_EMAIL", "OUTREACH_PASSWORD", "SQUARE_ACCESS_TOKEN"];
  const missingRequired = required.filter((k) => !String(process.env[k] || "").trim());
  const missingOptional = optionalWarn.filter((k) => !String(process.env[k] || "").trim());
  return { missingRequired, missingOptional };
}

function printEnvWarnings() {
  const r = validateEnv();
  if (r.missingRequired.length > 0) {
    console.warn("ENV WARNING required missing:", r.missingRequired.join(", "));
  }
  if (r.missingOptional.length > 0) {
    console.warn("ENV WARNING optional missing:", r.missingOptional.join(", "));
  }
  return r;
}

module.exports = { validateEnv, printEnvWarnings };
