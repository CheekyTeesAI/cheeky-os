/**
 * Session 3 Task 2 — Full pipeline smoke: voice quote → invoice → system status.
 * Run with Cheeky OS up: npm start (from email-intake)
 *
 *   node scripts/session3-pipeline-e2e.js
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const base = String(process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function fetchJson(method, path, body) {
  const opts = { method, headers: { Accept: "application/json" } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log("=== Session 3 E2E — River Dance Academy · 24 DTG t-shirts · front + back ===\n");
  console.log("Base URL:", base, "\n");

  console.log("--- Stage A: Malformed /voice/run (expect HTTP 400) ---");
  const bad = await fetchJson("POST", "/cheeky/voice/run", {});
  console.log("HTTP", bad.status, JSON.stringify(bad.data, null, 2));
  const badArr = await fetch(`${base}/cheeky/voice/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: "[]",
  });
  const badArrText = await badArr.text();
  let badArrData = null;
  try {
    badArrData = JSON.parse(badArrText);
  } catch {
    badArrData = badArrText.slice(0, 200);
  }
  console.log("HTTP (body=[])", badArr.status, JSON.stringify(badArrData, null, 2));

  console.log("\n--- Stage 1: /cheeky/voice/run (GENERATE_QUOTE + Prisma task) ---");
  const voiceBody = {
    text:
      "Subject: Quote request\n\nPlease quote 24 DTG t-shirts with front and back print for River Dance Academy.",
    product: "T-Shirts",
    source: "session3_e2e",
    fromEmail: "sarah@example.com",
  };
  const v1 = await fetchJson("POST", "/cheeky/voice/run", voiceBody);
  console.log("HTTP", v1.status);
  console.log(JSON.stringify(v1.data, null, 2));

  console.log("\n--- Stage 2: /cheeky/invoice/create (Square draft) ---");
  const invBody = {
    customerName: "River Dance Academy",
    title: "DTG T-Shirts — front & back",
    quantity: 24,
    unitPrice: 11.875,
    total: 285,
    customerEmail: "sarah@example.com",
  };
  const v2 = await fetchJson("POST", "/cheeky/invoice/create", invBody);
  console.log("HTTP", v2.status);
  console.log(JSON.stringify(v2.data, null, 2));

  console.log("\n--- Stage 3: GET /api/system/status ---");
  const v3 = await fetchJson("GET", "/api/system/status");
  console.log("HTTP", v3.status);
  console.log(JSON.stringify(v3.data, null, 2));

  console.log("\n=== E2E script finished ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
