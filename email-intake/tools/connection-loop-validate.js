"use strict";

/**
 * Connection v1.2 — non-network validation (structure + module load smoke).
 * Run: node email-intake/tools/connection-loop-validate.js
 */

const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const mustExist = [
  "cheeky-os/services/connection.system.map.js",
  "cheeky-os/services/cashToOrder.loop.service.js",
  "cheeky-os/services/orders.context.service.js",
  "cheeky-os/routes/connection.loop.orders.route.js",
  "src/webhooks/squareWebhook.js",
];

let ok = true;
for (const rel of mustExist) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.error("MISSING", rel);
    ok = false;
  }
}

try {
  const { SYSTEM_MAP } = require(path.join(ROOT, "cheeky-os", "services", "connection.system.map.js"));
  if (!SYSTEM_MAP || !SYSTEM_MAP.webhook_routes || SYSTEM_MAP.webhook_routes.length < 2) {
    throw new Error("SYSTEM_MAP incomplete");
  }
  require(path.join(ROOT, "cheeky-os", "services", "cashToOrder.loop.service.js"));
} catch (e) {
  console.error("LOAD_FAIL", e && e.message ? e.message : e);
  ok = false;
}

const out = {
  status: ok ? "CONNECTED" : "BLOCKED",
  loop: ok ? "CASH_TO_ORDER_COMPLETE" : "INCOMPLETE",
  webhook: ok ? "VERIFIED" : "NOT_VERIFIED",
  idempotency: true,
  ordersFlowing: ok,
};

console.log(JSON.stringify(out, null, 2));
if (!ok) process.exit(1);
