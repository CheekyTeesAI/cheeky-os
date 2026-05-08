"use strict";

/**
 * Cheeky AI integration wiring audit (additive build v1.0).
 * Run from repo: node email-intake/tools/cheeky-ai-integration-audit.js
 * Or: cd email-intake && node tools/cheeky-ai-integration-audit.js
 */

const fs = require("fs");
const path = require("path");

const INTAKE_ROOT = path.join(__dirname, "..");
const SERVICES_DIR = path.join(INTAKE_ROOT, "cheeky-os", "services");
const OPERATOR_ROUTES = path.join(INTAKE_ROOT, "operatorBridge", "operator.routes.js");
const SERVER_JS = path.join(INTAKE_ROOT, "cheeky-os", "server.js");

const REQUIRED_SERVICE_FILES = [
  "operator.context.aggregate.service.js",
  "reply.draft.canonical.service.js",
  "json.queue.persistence.service.js",
  "order-draft.bridge.service.js",
  "automation.status.service.js",
];

/** Substrings that must appear in mounted operator router (paths are relative to /api/operator). */
const ROUTE_MARKERS = [
  { api: "/api/operator/context/full", filePatterns: ["/context/full"] },
  { api: "/api/operator/actions/send-followup/:id", filePatterns: ["/actions/send-followup/:id"] },
  { api: "/api/operator/actions/send-all-followups", filePatterns: ["/actions/send-all-followups"] },
  { api: "/api/operator/actions/create-quote-draft/:inboundId", filePatterns: ["/actions/create-quote-draft/:inboundId"] },
];

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function readUtf8(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

const missing = [];

for (const f of REQUIRED_SERVICE_FILES) {
  const p = path.join(SERVICES_DIR, f);
  if (!exists(p)) missing.push(`Missing service file: cheeky-os/services/${f}`);
}

if (!exists(OPERATOR_ROUTES)) {
  missing.push("Missing operatorBridge/operator.routes.js");
}

const operatorSrc = readUtf8(OPERATOR_ROUTES);
const serverSrc = readUtf8(SERVER_JS);
const haystack = `${operatorSrc}\n${serverSrc}`;

for (const { api, filePatterns } of ROUTE_MARKERS) {
  const ok = filePatterns.some((pat) => operatorSrc.includes(pat) || haystack.includes(api));
  if (!ok) {
    missing.push(`Route not found (expected ${api} as mount path or patterns ${filePatterns.join(", ")})`);
  }
}

if (missing.length === 0) {
  console.log("CHEEKY AI INTEGRATION AUDIT PASS");
  process.exit(0);
} else {
  console.log("CHEEKY AI INTEGRATION AUDIT FAIL");
  for (const m of missing) console.log(" - " + m);
  process.exit(1);
}
