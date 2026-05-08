"use strict";

const fs = require("fs");
const path = require("path");
try {
  require("dotenv").config({ path: path.join(__dirname, "..", "email-intake", ".env") });
} catch (_) {}
const envValidation = require(path.join(__dirname, "..", "src", "services", "envValidation"));

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function exists(file) {
  try {
    fs.accessSync(file, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function routePass(selftest, route, status) {
  const checks = (selftest && selftest.checks) || [];
  return checks.some((c) => c.route === route && c.status === status);
}

function main() {
  const docsDir = path.join(process.cwd(), "docs");
  const selftestFile = path.join(docsDir, "chatgpt-selftest.json");
  const smoketestFile = path.join(docsDir, "chatgpt-live-smoketest.json");
  const openapiFile = path.join(docsDir, "chatgpt-openapi.json");

  const selftest = readJsonIfExists(selftestFile);
  const smoketest = readJsonIfExists(smoketestFile);
  const openapiPresent = exists(openapiFile);
  const baseUrl = (smoketest && smoketest.baseUrl) || (selftest && selftest.baseUrl) || process.env.SELFTEST_BASE_URL || process.env.PUBLIC_BASE_URL || "unknown";
  const envR = envValidation.getEnvReadiness();
  const authConfigured = envR.chatgptActionApiKeyReady;
  const publicUrlReady = envR.publicBaseUrlReady;

  const healthPass = routePass(selftest, "/api/chatgpt/health", 200) || routePass(smoketest, "/api/chatgpt/health", 200);
  const readinessPass = routePass(selftest, "/api/chatgpt/readiness", 200) || routePass(smoketest, "/api/chatgpt/readiness", 200);
  const protectedReads = smoketest
    ? smoketest.tests.filter((t) => t.route.includes("/api/chatgpt/") && t.method === "GET" && t.route !== "/api/chatgpt/health" && t.route !== "/api/chatgpt/readiness")
    : [];
  const protectedReadsFail = protectedReads.filter((t) => !t.pass).length;
  const protectedReadsState = !protectedReads.length ? "PARTIAL" : protectedReadsFail === 0 ? "PASS" : protectedReadsFail <= 2 ? "PARTIAL" : "FAIL";

  const guarded = smoketest ? smoketest.tests.filter((t) => t.route.includes("/api/chatgpt/actions/")) : [];
  const guardedFail = guarded.filter((t) => !t.pass).length;
  const guardedState = !guarded.length ? "PARTIAL" : guardedFail === 0 ? "PASS" : guardedFail <= 1 ? "PARTIAL" : "FAIL";

  const unsafe = smoketest ? smoketest.tests.find((t) => t.route === "/api/chatgpt/actions/send-customer-message") : null;
  const unsafeBlocks = unsafe && unsafe.pass ? "PASS" : "FAIL";

  const selftestChecksPass =
    selftest && Array.isArray(selftest.checks) ? selftest.checks.filter((c) => c.pass === false).length === 0 : null;
  const testsPass = smoketest && smoketest.verdict === "PASS" && (selftestChecksPass !== false);

  let overallVerdict = "BLOCKED";
  if (openapiPresent && healthPass && readinessPass && protectedReadsState === "PASS" && guardedState !== "FAIL" && unsafeBlocks === "PASS") {
    if (authConfigured && publicUrlReady && testsPass && envR.blockedReasons.length === 0) {
      overallVerdict = "READY";
    } else {
      overallVerdict = "PARTIAL";
    }
  } else if (openapiPresent && (healthPass || readinessPass)) {
    overallVerdict = "PARTIAL";
  }

  const readiness = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    openapiPresent,
    authConfigured,
    publicBaseUrlReady: publicUrlReady,
    envReadiness: envR,
    healthRoute: healthPass ? "PASS" : "FAIL",
    readinessRoute: readinessPass ? "PASS" : "FAIL",
    protectedReads: protectedReadsState,
    guardedActions: guardedState,
    unsafeBlocks,
    selftestChecksPass: selftestChecksPass === null ? "UNKNOWN" : selftestChecksPass ? "PASS" : "FAIL",
    overallVerdict,
    notes: envR.blockedReasons
      .concat([smoketest ? `Live smoketest verdict=${smoketest.verdict}` : "Live smoketest file missing"])
      .concat([selftestChecksPass === true ? "Selftest checks: PASS" : selftestChecksPass === false ? "Selftest checks: FAIL" : "Selftest: not run"]),
  };

  const md = [
    "# ChatGPT Readiness Report",
    "",
    `## GPT Actions Status`,
    "",
    `**GPT ACTIONS STATUS: ${readiness.overallVerdict}**`,
    "",
    readiness.overallVerdict === "READY"
      ? "All checks passed: environment is non-placeholder, HTTPS public URL, OpenAPI present, and chatgpt self-test + smoketest passed."
      : readiness.overallVerdict === "PARTIAL"
        ? "One or more items incomplete: see `envReadiness`, route results, and Notes below. Fix env and re-run `npm run chatgpt:launch-validate`."
        : "Blocked: fix blockers in Notes and re-run validation.",
    "",
    `- Generated: ${readiness.generatedAt}`,
    `- Base URL: ${readiness.baseUrl}`,
    `- OpenAPI present: ${readiness.openapiPresent}`,
    `- CHATGPT_ACTION_API_KEY ready: ${readiness.authConfigured}`,
    `- PUBLIC_BASE_URL ready (https, non-placeholder): ${readiness.publicBaseUrlReady}`,
    `- Selftest checks: ${readiness.selftestChecksPass}`,
    `- Health route: ${readiness.healthRoute}`,
    `- Readiness route: ${readiness.readinessRoute}`,
    `- Protected reads: ${readiness.protectedReads}`,
    `- Guarded actions: ${readiness.guardedActions}`,
    `- Unsafe blocking: ${readiness.unsafeBlocks}`,
    `- Overall verdict: ${readiness.overallVerdict}`,
    "",
    "## envReadiness (from src/services/envValidation.js)",
    "```json",
    JSON.stringify(readiness.envReadiness, null, 2),
    "```",
    "",
    "## Notes",
    ...readiness.notes.map((n) => `- ${n}`),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(docsDir, "chatgpt-readiness-report.md"), md, "utf8");
  fs.writeFileSync(path.join(docsDir, "chatgpt-action-readiness.json"), `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(readiness, null, 2));
  if (readiness.overallVerdict === "READY") {
    console.log("");
    console.log("🔥 CHEEKY OS LAUNCH STATUS: READY");
    console.log("✅ Auth: PASS");
    console.log("✅ Routes: PASS");
    console.log("✅ Tests: PASS");
    console.log("✅ Safety: PASS");
    console.log("🚀 SYSTEM IS LIVE FOR CHATGPT CONNECTION");
  }
}

main();
