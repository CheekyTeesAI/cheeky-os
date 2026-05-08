"use strict";

/**
 * GET /api/cheeky-os/dashboard-data — pretty-print + verify `tiles` shape.
 * Loads email-intake/.env via npm script (-r cheekyOsLoadEnv.js).
 *
 * Env overrides:
 *   CHEEKY_DASHBOARD_TEST_URL — full origin only, e.g. http://127.0.0.1:3000 (default from PORT/CHEEKY_OS_PORT)
 *
 * Sends X-Cheeky-Dashboard-Key when CHEEKY_DASHBOARD_API_KEY or CHEEKY_ADMIN_API_KEY is set.
 */

const REQUIRED_TILE_KEYS = [
  "OrdersOnHold",
  "OrdersWaitingOnArt",
  "Estimates",
  "BlanksNeeded",
  "OrdersNeedingArt",
  "QueueDepth",
  "LastIntakeTime",
  "WorkerStatus",
  "ActiveJobs",
  "TotalOrdersToday",
  "GeneratedAt",
  "Source",
  "HealthSummary",
];

async function main() {
  const port = Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000) || 3000;
  const base = String(process.env.CHEEKY_DASHBOARD_TEST_URL || `http://127.0.0.1:${port}`).replace(
    /\/$/,
    ""
  );
  const url = `${base}/api/cheeky-os/dashboard-data`;
  const dashKey = String(process.env.CHEEKY_DASHBOARD_API_KEY || "").trim();
  const adminKey = String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
  const apiKey = dashKey || adminKey;

  /** @type {Record<string,string>} */
  const headers = { Accept: "application/json" };
  if (apiKey) headers["X-Cheeky-Dashboard-Key"] = apiKey;

  console.error(`GET ${url}`);
  if (!apiKey) {
    console.error(
      "(no CHEEKY_DASHBOARD_API_KEY / CHEEKY_ADMIN_API_KEY in env — OK if CHEEKY_DASHBOARD_REQUIRE_AUTH=false and key not required)"
    );
  }

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    console.error("Request failed:", e && e.message ? e.message : e);
    console.error("Is Cheeky OS listening? Run: npm start");
    process.exit(1);
  }

  const text = await res.text();
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error("Non-JSON body (first 600 chars):\n", text.slice(0, 600));
    process.exit(1);
  }

  console.log(JSON.stringify(body, null, 2));

  const tiles =
    typeof body === "object" &&
    body &&
    typeof /** @type {{ tiles?: unknown }} */ (body).tiles === "object" &&
    body.tiles
      ? /** @type {{ tiles: Record<string, unknown> }} */ (body).tiles
      : null;

  if (!res.ok) {
    console.error(`\nHTTP ${res.status} — auth or server error`);
    if (res.status === 401) {
      console.error(
        "Tip: Set CHEEKY_DASHBOARD_API_KEY (or ADMIN key) in .env and rerun, or temporarily require auth off in dev."
      );
    }
    process.exit(1);
  }

  if (!tiles || typeof tiles !== "object") {
    console.error("\nmissing tiles object");
    process.exit(1);
  }

  const missing = REQUIRED_TILE_KEYS.filter((k) => !(k in tiles));
  if (missing.length) {
    console.error("\nmissing tiles keys:", missing.join(", "));
    process.exit(1);
  }

  console.error("\nOK — HTTP 200 and full `tiles` keys present.");
  const st = typeof body === "object" && body && "status" in body ? String(/** @type any */ (body).status) : "";
  if (st) console.error(`Response status gate: ${st}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
