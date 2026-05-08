"use strict";

const fs = require("fs");
const path = require("path");
try {
  require("dotenv").config({ path: path.join(__dirname, "..", "email-intake", ".env") });
} catch (_) {}
const envValidation = require(path.join(__dirname, "..", "src", "services", "envValidation"));

const baseUrl = String(process.env.SELFTEST_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3011").replace(/\/$/, "");
const apiKey = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
const serverKeyOk = envValidation.isServerChatgptApiKeyConfigValid();

function isJsonResponse(resp, bodyText) {
  const ct = String(resp.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return true;
  try {
    JSON.parse(bodyText);
    return true;
  } catch (_) {
    return false;
  }
}

async function callApi(method, route, body, withAuth) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (withAuth && apiKey) headers["x-api-key"] = apiKey;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { method, route, status: response.status, ok: response.ok, text, json, jsonLike: isJsonResponse(response, text) };
}

function evaluate(test, checker) {
  try {
    const ok = checker(test);
    return { ...test, pass: Boolean(ok) };
  } catch (err) {
    return { ...test, pass: false, error: err && err.message ? err.message : String(err) };
  }
}

function summarize(verdicts) {
  const failed = verdicts.filter((v) => !v.pass);
  if (!failed.length) return "PASS";
  if (failed.length <= 3) return "PARTIAL";
  return "FAIL";
}

function authedJsonOk(t) {
  if (!serverKeyOk) {
    return t.status === 401 && t.jsonLike;
  }
  return t.status === 200 && t.jsonLike;
}

async function main() {
  const tests = [];

  tests.push(evaluate(await callApi("GET", "/api/chatgpt/health", null, false), (t) => t.status === 200 && t.jsonLike));
  tests.push(evaluate(await callApi("GET", "/api/chatgpt/readiness", null, false), (t) => t.status === 200 && t.jsonLike));

  const noAuth = await callApi("GET", "/api/chatgpt/system-status", null, false);
  tests.push(evaluate(noAuth, (t) => t.status === 401 && t.jsonLike));
  const withAuth = await callApi("GET", "/api/chatgpt/system-status", null, true);
  tests.push(evaluate(withAuth, authedJsonOk));

  const coreRoutes = [
    "/api/chatgpt/system-status",
    "/api/chatgpt/operator-summary",
    "/api/chatgpt/payments",
    "/api/chatgpt/decisions/top",
    "/api/chatgpt/cash/runway",
  ];
  for (const route of coreRoutes) {
    tests.push(evaluate(await callApi("GET", route, null, true), authedJsonOk));
  }

  tests.push(
    evaluate(
      await callApi("POST", "/api/chatgpt/actions/create-internal-task", { entityType: "order", entityId: "123", taskType: "CHATGPT_INTERNAL_REVIEW", note: "smoke test" }, true),
      authedJsonOk
    )
  );
  tests.push(
    evaluate(
      await callApi("POST", "/api/chatgpt/actions/run-decision-engine", { source: "smoketest" }, true),
      authedJsonOk
    )
  );
  tests.push(
    evaluate(
      await callApi("POST", "/api/chatgpt/actions/create-vendor-draft", { taskId: "smoke-missing-task" }, true),
      authedJsonOk
    )
  );

  const unsafeProof = await callApi("POST", "/api/chatgpt/actions/send-customer-message", { customerId: "x" }, true);
  tests.push(
    evaluate(unsafeProof, (t) => {
      if (!serverKeyOk) {
        return (t.status === 401 || t.status === 404) && t.jsonLike;
      }
      return (t.status === 404 || t.status === 401 || t.status === 200) && t.jsonLike;
    })
  );

  const verdict = summarize(tests);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    envReadiness: envValidation.getEnvReadiness(),
    serverKeyAcceptable: serverKeyOk,
    verdict,
    passed: tests.filter((t) => t.pass).length,
    failed: tests.filter((t) => !t.pass).length,
    tests: tests.map((t) => ({
      method: t.method,
      route: t.route,
      status: t.status,
      pass: t.pass,
      jsonLike: t.jsonLike,
      hasBody: Boolean(t.text && t.text.length),
      error: t.error || null,
    })),
  };

  const out = path.join(process.cwd(), "docs", "chatgpt-live-smoketest.json");
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("[chatgpt-live-smoketest] baseUrl:", baseUrl);
  console.log("[chatgpt-live-smoketest] passed:", report.passed, "failed:", report.failed);
  console.log("[chatgpt-live-smoketest] verdict:", verdict);
  console.log(JSON.stringify(report, null, 2));

  process.exit(verdict === "FAIL" ? 1 : 0);
}

main().catch((err) => {
  console.error("[chatgpt-live-smoketest] fatal", err && err.message ? err.message : String(err));
  process.exit(1);
});
