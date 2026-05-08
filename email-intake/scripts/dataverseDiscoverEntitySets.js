#!/usr/bin/env node
"use strict";

/**
 * Full metadata scan: list EntitySets on DATAVERSE_URL and suggest CHEEKY_CT_* env overrides.
 *
 * Usage (from repo email-intake/):
 *   node scripts/dataverseDiscoverEntitySets.js
 *   node scripts/dataverseDiscoverEntitySets.js --match=intake
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const { fetchSafe } = require("../cheeky-os/utils/fetchSafe");

(async () => {
  const dv = String(process.env.DATAVERSE_URL || "").replace(/\/$/, "");
  if (!dv) {
    console.error("DATAVERSE_URL is not set.");
    process.exit(1);
  }

  const argMatch =
    process.argv.find((a) => a.startsWith("--match="))?.split("=")[1]?.toLowerCase() || "";

  const tUrl = `https://login.microsoftonline.com/${process.env.DATAVERSE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.DATAVERSE_CLIENT_ID || "",
    client_secret: process.env.DATAVERSE_CLIENT_SECRET || "",
    scope: `${dv}/.default`,
  });
  const tr = await fetchSafe(tUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    timeoutMs: 30000,
  });
  if (!tr.ok || !tr.data?.access_token) {
    console.error("Token failed:", tr.error);
    process.exit(1);
  }
  const auth = `Bearer ${tr.data.access_token}`;

  const metaUrl = `${dv}/api/data/v9.2/$metadata`;
  const m = await fetchSafe(metaUrl, {
    headers: { Accept: "application/xml", Authorization: auth },
    timeoutMs: 180000,
  });
  if (!m.ok || typeof m.data !== "string") {
    console.error("$metadata failed:", m.error);
    process.exit(1);
  }

  const xml = m.data;
  const re = /<EntitySet Name="([^"]+)"/gim;
  const sets = [];
  let x;
  while ((x = re.exec(xml))) sets.push(x[1]);

  const uniq = [...new Set(sets)].sort();
  console.log("Environment:", dv);
  console.log("Total EntitySets:", uniq.length);

  const intakeLike = uniq.filter((n) => /intake|audit|queue/i.test(n));
  console.log("\n--- Likely intake / audit (name contains intake|audit|queue) ---");
  intakeLike.forEach((n) => console.log(" ", n));

  const crLike = uniq.filter((n) => /^cr[0-9]+_/i.test(n));
  console.log("\n--- Publisher-prefixed EntitySets (pattern cr*N_*, first 40) ---");
  crLike.slice(0, 40).forEach((n) => console.log(" ", n));
  if (crLike.length > 40) console.log(`  ... +${crLike.length - 40} more`);

  const ctLike = uniq.filter((n) => /^ct_/i.test(n));
  console.log("\n--- All ct_* EntitySets (first 80) ---");
  ctLike.slice(0, 80).forEach((n) => console.log(" ", n));
  if (ctLike.length > 80) console.log(`  ... +${ctLike.length - 80} more`);

  if (argMatch) {
    console.log(`\n--- Filter --match=${argMatch} ---`);
    uniq
      .filter((n) => n.toLowerCase().includes(argMatch))
      .forEach((n) => console.log(" ", n));
  }

  const defIntake = "ct_intake_queues";
  const defAudit = "ct_audit_events";
  const hasDefI = uniq.includes(defIntake);
  const hasDefA = uniq.includes(defAudit);

  console.log("\n=== Suggested .env ===");
  console.log("# Publisher prefix — column logical names:");
  console.log("#   ct (default): ct_name, ct_status, …");
  console.log("#   Copilot Publisher 1 tables: CHEEKY_DV_PUBLISHER_PREFIX=cr2d1");
  console.log("# Entity sets (still use CHEEKY_CT_* overrides):");
  console.log("# CHEEKY_CT_INTAKE_ENTITY_SET=cr2d1_intakequeues");
  console.log("# CHEEKY_CT_AUDIT_ENTITY_SET=cr2d1_auditevents");
  console.log("");
  console.log(`Default ct_intake_queues present: ${hasDefI ? "YES" : "NO — ADD TABLE OR FIX NAME"}`);
  console.log(`Default ct_audit_events present: ${hasDefA ? "YES" : "NO — ADD TABLE OR FIX NAME"}`);

  console.log("\n=== App user (Power Platform) ===");
  console.log("1. admin.powerplatform.microsoft.com → Environments → Users → Application users");
  console.log("2. Add your app registration; assign Security Role with:");
  console.log("   - Organization-scope Read/Write/Create on Intake Queue + Audit Event tables");
  console.log("3. Publish all customizations after role/table changes.");

  process.exit(0);
})();
