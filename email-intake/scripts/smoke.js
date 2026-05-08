#!/usr/bin/env node
/**
 * Lightweight backend smoke — same base URL contract as smoke-test.js.
 * Probes cheeky-os routes + /api mirrors. No mutations.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

function request(method, pathname) {
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
    const req = lib.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method,
        headers: { "User-Agent": "cheeky-smoke/2", Accept: "application/json" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 400),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const paths = [
  ["GET", "/health"],
  ["GET", "/system/health"],
  ["GET", "/system/routes"],
  ["GET", "/production/queue"],
  ["GET", "/api/production/queue"],
  ["GET", "/dashboard/next-action"],
  ["GET", "/dashboard/next-task"],
  ["GET", "/api/dashboard/next-action"],
  ["GET", "/summary/today"],
  ["GET", "/api/summary/today"],
  ["GET", "/summary/daily-summary"],
  ["GET", "/sales/command-center"],
  ["GET", "/automation/actions"],
  ["GET", "/next/actions"],
];

/** PostgreSQL operator handlers load from dist — 503 until `npm run build`. */
const pathsOptionalDist = [
  ["GET", "/api/operator/deposit-followups"],
  ["GET", "/api/operator/garment-orders"],
];

async function main() {
  console.log(`smoke.js → ${BASE}`);
  let failed = 0;
  for (const [method, p] of paths) {
    try {
      const res = await request(method, p);
      if (res.status >= 200 && res.status < 500) {
        console.log(`OK  ${method} ${p} → ${res.status}`);
      } else {
        console.log(`FAIL ${method} ${p} → ${res.status}`);
        failed += 1;
      }
    } catch (e) {
      console.log(`FAIL ${method} ${p} → ${e instanceof Error ? e.message : e}`);
      failed += 1;
    }
  }
  for (const [method, p] of pathsOptionalDist) {
    try {
      const res = await request(method, p);
      if (res.status === 200 || res.status === 503) {
        console.log(`OK  ${method} ${p} → ${res.status} (200=live,503=needs dist build)`);
      } else {
        console.log(`FAIL ${method} ${p} → ${res.status}`);
        failed += 1;
      }
    } catch (e) {
      console.log(`FAIL ${method} ${p} → ${e instanceof Error ? e.message : e}`);
      failed += 1;
    }
  }
  if (failed) process.exit(1);
}

main();
