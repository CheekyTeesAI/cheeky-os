"use strict";

/**
 * Loads email-intake/.env, points SELFTEST at http://127.0.0.1:<PORT> (or SELFTEST_BASE_URL), then
 * selftest → smoketest → readiness. Start Cheeky OS first; set PORT to match, or SELFTEST_BASE_URL for a remote site.
 */

const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
try {
  require("dotenv").config({ path: path.join(root, "email-intake", ".env") });
} catch (_) {}

const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
if (!process.env.SELFTEST_BASE_URL) {
  // Local validation should hit the running Cheeky OS process. Use PUBLIC_BASE_URL
  // only if you set SELFTEST_BASE_URL to an explicit remote base yourself.
  process.env.SELFTEST_BASE_URL = `http://127.0.0.1:${port}`;
}

function run(cmd) {
  console.log(`[chatgpt:launch-validate] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env }, cwd: root, shell: process.platform === "win32" });
}

console.log("[chatgpt:launch-validate] SELFTEST_BASE_URL=" + process.env.SELFTEST_BASE_URL);
run("node scripts/chatgpt-selftest.js");
run("node scripts/chatgpt-live-smoketest.js");
run("node scripts/generate-chatgpt-readiness-report.js");
console.log("[chatgpt:launch-validate] done. See docs/chatgpt-action-readiness.json and GET /api/chatgpt/launch-check");
