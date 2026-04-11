/**
 * Cheeky OS — Credential Verification
 * Verifies that required environment variables are present
 * for Square API, Dataverse, and Email (optional).
 *
 * Run as: node verify-credentials.js
 *
 * @module verify-credentials
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// ── Results accumulator ─────────────────────────────────────────────────────
const results = [];
let requiredPassing = true;

/**
 * Check an environment variable condition and log the result.
 * @param {string} name       - Display name for the check.
 * @param {boolean} condition - Whether the check passed.
 * @param {string} successMsg - Message to show on success.
 * @param {string} failMsg    - Message to show on failure.
 * @param {boolean} [optional=false] - If true, failure is a warning not an error.
 */
function check(name, condition, successMsg, failMsg, optional) {
  if (condition) {
    console.log("  \u2705 " + name + ": " + successMsg);
    results.push({ name: name, status: "pass" });
  } else if (optional) {
    console.log("  \u26A0\uFE0F  " + name + ": " + failMsg);
    results.push({ name: name, status: "warn" });
  } else {
    console.log("  \u274C " + name + ": " + failMsg);
    results.push({ name: name, status: "fail" });
    requiredPassing = false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log("");
console.log("=".repeat(50));
console.log("  \uD83D\uDD0D CHEEKY OS \u2014 Credential Verification");
console.log("  " + new Date().toISOString());
console.log("=".repeat(50));

// ── Square API ──────────────────────────────────────────────────────────────
console.log("\n  --- Square API ---");
check(
  "Square",
  !!process.env.SQUARE_ACCESS_TOKEN,
  "Access token configured",
  "Missing SQUARE_ACCESS_TOKEN"
);
check(
  "Square",
  !!process.env.SQUARE_LOCATION_ID,
  "Location ID configured",
  "Missing SQUARE_LOCATION_ID"
);

// ── Dataverse (Microsoft) ───────────────────────────────────────────────────
console.log("\n  --- Dataverse ---");
check(
  "Dataverse",
  !!process.env.DATAVERSE_URL,
  "URL configured (" + (process.env.DATAVERSE_URL || "").slice(0, 40) + ")",
  "Missing DATAVERSE_URL"
);
check(
  "Dataverse",
  !!process.env.DATAVERSE_CLIENT_ID,
  "Client ID configured",
  "Missing DATAVERSE_CLIENT_ID"
);
check(
  "Dataverse",
  !!process.env.DATAVERSE_CLIENT_SECRET,
  "Client secret configured",
  "Missing DATAVERSE_CLIENT_SECRET"
);

// ── Email (Optional) ────────────────────────────────────────────────────────
console.log("\n  --- Email (optional) ---");
check(
  "Email",
  !!process.env.EMAIL_USER,
  "Email user configured (" + (process.env.EMAIL_USER || "") + ")",
  "Not configured (EMAIL_USER)",
  true
);
check(
  "Email",
  !!process.env.EMAIL_PASS,
  "Email password configured",
  "Not configured (EMAIL_PASS)",
  true
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(50));

var passed = results.filter(function (r) { return r.status === "pass"; }).length;
var failed = results.filter(function (r) { return r.status === "fail"; }).length;
var warned = results.filter(function (r) { return r.status === "warn"; }).length;

console.log("  Passed: " + passed + "  |  Failed: " + failed + "  |  Warnings: " + warned);
console.log("");

if (requiredPassing) {
  console.log("  \uD83D\uDE80 System READY for live testing");
} else {
  console.log("  \u26A0\uFE0F  System NOT ready \u2014 missing required credentials");
}

console.log("=".repeat(50));
console.log("");

process.exit(requiredPassing ? 0 : 1);
