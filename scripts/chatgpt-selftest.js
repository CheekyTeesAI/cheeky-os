"use strict";

const fs = require("fs");
const path = require("path");
try {
  require("dotenv").config({ path: path.join(__dirname, "..", "email-intake", ".env") });
} catch (_) {}
const envValidation = require(path.join(__dirname, "..", "src", "services", "envValidation"));

const baseUrl = String(process.env.SELFTEST_BASE_URL || "http://127.0.0.1:3011").replace(/\/$/, "");
const apiKey = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
const serverKeyOk = envValidation.isServerChatgptApiKeyConfigValid();

async function hit(route, auth) {
  const headers = {};
  if (auth && apiKey) headers["x-api-key"] = apiKey;
  const r = await fetch(`${baseUrl}${route}`, { headers });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { route, auth: Boolean(auth), status: r.status, ok: r.ok, json };
}

async function main() {
  const checks = [];
  checks.push(await hit("/api/chatgpt/health", false));
  checks.push(await hit("/api/chatgpt/readiness", false));
  checks.push(await hit("/api/chatgpt/system-status", false));
  checks.push(await hit("/api/chatgpt/system-status", true));
  checks.push(await hit("/api/chatgpt/operator-summary", true));

  const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    envReadiness: envValidation.getEnvReadiness(),
    serverKeyAcceptable: serverKeyOk,
    authConfigured: serverKeyOk,
    checks: checks.map((c) => {
      let pass = false;
      if (c.route === "/api/chatgpt/health" && !c.auth) pass = c.status === 200;
      if (c.route === "/api/chatgpt/readiness" && !c.auth) pass = c.status === 200;
      if (c.route === "/api/chatgpt/system-status" && !c.auth) pass = c.status === 401;
      if (c.route === "/api/chatgpt/system-status" && c.auth) {
        pass = serverKeyOk ? c.status === 200 : c.status === 401;
      }
      if (c.route === "/api/chatgpt/operator-summary" && c.auth) {
        pass = serverKeyOk ? c.status === 200 : c.status === 401;
      }
      return {
        route: c.route,
        auth: c.auth,
        status: c.status,
        ok: c.ok,
        pass,
        successFlag: c.json && typeof c.json.success === "boolean" ? c.json.success : null,
      };
    }),
  };

  const out = path.join(process.cwd(), "docs", "chatgpt-selftest.json");
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[chatgpt-selftest] fatal", err && err.message ? err.message : String(err));
  process.exit(1);
});
