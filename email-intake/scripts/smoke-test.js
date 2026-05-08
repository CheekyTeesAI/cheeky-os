#!/usr/bin/env node
/**
 * Cheeky OS — local smoke verification (Node built-ins only).
 *
 * Env:
 *   SMOKE_BASE_URL          — default http://127.0.0.1:3000
 *   SMOKE_API_KEY           — reserved for future authenticated probes (unused by default)
 *   SQUARE_WEBHOOK_SIGNATURE_KEY / SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY / SQUARE_WEBHOOK_NOTIFICATION_URL
 *     — read locally to align expectations with the server process (same .env as `npm run dev`).
 *
 * Limitation: canonical webhook POST uses a no-match payload (no order in DB) to avoid money mutations.
 * Signature correctness is not forged; when verification is required, missing/invalid creds must reject (non-200).
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

let passCount = 0;
let failCount = 0;
const skips = [];

function pass(name) {
  passCount += 1;
  console.log(`PASS: ${name}`);
}

function fail(name, reason) {
  failCount += 1;
  console.log(`FAIL: ${name} - ${reason}`);
}

function skip(name, reason) {
  skips.push({ name, reason });
  console.log(`SKIP: ${name} - ${reason}`);
}

function request(method, pathname, options) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(pathname.startsWith("http") ? pathname : `${BASE}${pathname}`);
    } catch (e) {
      reject(e);
      return;
    }
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const port = u.port || (isHttps ? 443 : 80);
    const headers = Object.assign(
      { "User-Agent": "cheeky-smoke-test/1" },
      (options && options.headers) || {}
    );
    const req = lib.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers
          });
        });
      }
    );
    req.on("error", reject);
    if (options && options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testHealth() {
  const name = "GET /health";
  try {
    const res = await request("GET", "/health");
    if (res.status === 200) {
      pass(name);
      return true;
    }
    fail(name, `expected status 200, got ${res.status}`);
    return false;
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function testCanonicalSquareWebhook() {
  const name = "POST /api/square/webhook (routing + verification behavior)";
  const key = (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim();
  const skipVerify = process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY === "true";

  const body = JSON.stringify({
    event_id: `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "unknown"
  });

  try {
    const res = await request("POST", "/api/square/webhook", {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body, "utf8")
      },
      body
    });

    if (key && !skipVerify) {
      if (res.status === 401) {
        pass(name + " (signature required → 401)");
        return true;
      }
      if (res.status >= 400 && res.status < 500) {
        pass(name + ` (gated → ${res.status})`);
        return true;
      }
      if (res.status >= 500) {
        const msg = res.body.slice(0, 200);
        pass(name + ` (verification/config rejected → ${res.status}: ${msg})`);
        return true;
      }
      fail(
        name,
        `signature key set and skip false: expected 4xx/5xx when unsigned, got ${res.status}`
      );
      return false;
    }

    if (res.status === 401) {
      fail(name, `unexpected 401 when verification not required (key empty or SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY=true)`);
      return false;
    }
    if (res.status !== 200) {
      fail(name, `expected 200 when verification skipped/disabled, got ${res.status}`);
      return false;
    }
    pass(name + " (reached handler)");
    return true;
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function testLegacyWebhookPath() {
  const name = "POST /webhooks/square (legacy compatibility, non-payment event)";
  const body = JSON.stringify({ type: "smoke.not_a_real_event" });
  try {
    const res = await request("POST", "/webhooks/square", {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body, "utf8")
      },
      body
    });
    if (res.status === 200) {
      pass(name);
      return true;
    }
    fail(name, `expected 200, got ${res.status}`);
    return false;
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function testStaffDashboard() {
  const name = "GET /staff (static dashboard)";
  try {
    const res = await request("GET", "/staff");
    if (res.status === 200) {
      pass(name);
      return true;
    }
    fail(name, `expected status 200, got ${res.status}`);
    return false;
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function testOptionalProbe() {
  const candidates = ["/system/check", "/healthz"];
  for (const p of candidates) {
    const name = `optional GET ${p}`;
    try {
      const res = await request("GET", p);
      if (res.status === 200) {
        pass(name);
        return true;
      }
    } catch (_) {
      /* try next */
    }
  }
  skip(
    "optional secondary health",
    "neither /system/check nor /healthz returned 200 (server may use a different surface)"
  );
  return true;
}

async function main() {
  console.log(`Cheeky OS smoke test → ${BASE}`);
  console.log("---");

  const r1 = await testHealth();
  const r2 = await testCanonicalSquareWebhook();
  const r3 = await testLegacyWebhookPath();
  const r4 = await testStaffDashboard();
  const r5 = await testOptionalProbe();

  const requiredOk = r1 && r2 && r3 && r4;
  void r5;
  console.log("---");
  console.log(
    `Summary: ${passCount} passed, ${failCount} failed, ${skips.length} skipped`
  );
  if (skips.length) {
    for (const s of skips) {
      console.log(`  (skipped) ${s.name}: ${s.reason}`);
    }
  }
  console.log(
    "Note: canonical POST uses a synthetic event with no matching order — avoids order/payment mutations."
  );

  if (!requiredOk || failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL: smoke harness", e);
  process.exit(1);
});
