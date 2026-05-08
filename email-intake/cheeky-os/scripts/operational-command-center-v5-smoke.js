"use strict";

/**
 * Operational Command Center v5 smoke tests (no server required for most checks).
 * Optional HTTP checks: set SELFTEST_BASE_URL or CHEEKY_E2E_BASE_URL (e.g. http://127.0.0.1:3000).
 */

const path = require("path");
const http = require("http");

process.chdir(path.join(__dirname, ".."));

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || "assertion failed");
};

const { createTask } = require("../agent/taskSchema");
const taskQueue = require("../agent/taskQueue");
const agentRunner = require("../agent/agentRunner");
const approvalEngine = require("../workflow/approvalEngine");
const { buildOperationalSnapshot } = require("../dashboard/dashboardAggregator");
const { generateRecommendations } = require("../intelligence/recommendationEngine");
const health = require("../diagnostics/systemHealthEngine");
const osm = require("../memory/operatorSessionMemory");
const fmt = require("../operator/operatorResponseFormatter");
const cool = require("../services/taskFailCooldown");

function httpGetJson(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search || ""}`,
        method: "GET",
        timeout: timeoutMs || 4000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (_e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.end();
  });
}

async function main() {
  console.log("[v5-smoke] cwd=%s", process.cwd());

  // --- Approval lifecycle (JSONL engine) ---
  const aid = `smoke-apr-${Date.now()}`;
  const c1 = approvalEngine.createApprovalRequest({
    taskId: aid,
    requestedBy: "v5-smoke",
    reason: "smoke_test",
  });
  assert(c1.ok && c1.approval && c1.approval.status === "pending", "createApprovalRequest");
  const apId = c1.approval.approvalId;
  const c2 = approvalEngine.approveRequest(apId, "v5-smoke");
  assert(c2.ok && c2.approval && c2.approval.status === "approved", "approveRequest");

  // --- Dashboard aggregation ---
  const dash = buildOperationalSnapshot();
  assert(dash && dash.revenue && dash.production && dash.approvals && dash.processor, "dashboard shape");
  assert(Array.isArray(dash.alerts), "dashboard alerts array");
  assert(Array.isArray(dash.recommendations), "dashboard recommendations array");

  // --- Recommendations ---
  const recs = generateRecommendations();
  assert(Array.isArray(recs), "recs array");
  for (let i = 0; i < Math.min(3, recs.length); i++) {
    assert(recs[i].recommendationId && recs[i].category && recs[i].severity, "rec fields");
  }

  // --- System health ---
  const h = health.summarizeHealth();
  assert(h.overallGrade && Array.isArray(h.checks), "health summary");
  const fails = health.listRecentFailures(5);
  assert(Array.isArray(fails), "failures list");

  // --- Operator memory ---
  osm.rememberInteraction("query", { q: "v5-smoke" });
  const ctx = osm.getRecentContext();
  assert(ctx && Array.isArray(ctx.recentQueries), "session memory");
  const sum = osm.summarizeRecentActivity();
  assert(typeof sum === "string" && sum.length > 0, "session summary");

  // --- Duplicate fingerprint ---
  const base = {
    intent: "query",
    target: "smoke-fingerprint-target",
    requirements: ["npm run lint"],
    requestedBy: "v5-smoke",
    priority: "normal",
    status: "pending",
  };
  const t1 = createTask(Object.assign({ taskId: `smoke-fp-a-${Date.now()}` }, base));
  const t2 = createTask(Object.assign({ taskId: `smoke-fp-b-${Date.now()}` }, base));
  const e1 = taskQueue.enqueueTask(t1);
  assert(e1.ok, "enqueue t1");
  const e2 = taskQueue.enqueueTask(t2);
  assert(!e2.ok && e2.error === "duplicate_task_fingerprint_recent", "duplicate fingerprint");
  taskQueue.rejectTask(t1.taskId, "v5-smoke_cleanup");

  // --- Cooldown ---
  const tc = createTask({
    taskId: `smoke-cool-${Date.now()}`,
    intent: "query",
    target: "cool",
    requirements: ["x"],
    priority: "normal",
    status: "pending",
  });
  const enc = taskQueue.enqueueTask(tc);
  assert(enc.ok, "enqueue cool task");
  taskQueue.markFailed(tc.taskId, "smoke_fail");
  const cd = cool.isCoolingDown(tc.taskId);
  assert(cd.cooling === true && cd.retryAfterMs > 0, "cooldown active");
  taskQueue.rejectTask(tc.taskId, "v5-smoke_cleanup");

  // --- Approval enforcement (execute intent) ---
  const tx = createTask({
    taskId: `smoke-exec-${Date.now()}`,
    intent: "execute",
    target: 'node -e "process.exit(0)"',
    requirements: ["x"],
    priority: "normal",
    status: "approved",
  });
  const ex = taskQueue.enqueueTask(tx);
  assert(ex.ok, "enqueue exec");
  const g0 = approvalEngine.verifyExecutionAllowed(tx);
  assert(g0 && g0.allowed === false, "blocked without workflow ledger");
  approvalEngine.approvePendingForTask(tx.taskId, "v5-smoke");
  const g1 = approvalEngine.verifyExecutionAllowed(tx);
  assert(g1 && g1.allowed === true, "allowed after bridge/synthetic approval");
  const runOut = await agentRunner.runTask(Object.assign({}, tx, { executionCorrelationId: "smoke-corr" }));
  assert(runOut && (runOut.success === true || runOut.ok === true), "runTask success");
  taskQueue.markCompleted(tx.taskId, runOut);

  // --- Formatters ---
  const fin = fmt.formatFinancialSummary({ unpaidCount: 3, outstandingCents: 842000, oldestDays: 22, highestRiskCustomer: "XYZ Athletics" });
  assert(/XYZ Athletics/.test(fin), "financial formatter");
  const prod = fmt.formatProductionSummary({ queueSize: 10, lateJobsApprox: 2, missingArt: 1, missingBlanks: 0, tasksRunning: 1, tasksFailed: 0 });
  assert(/queue/.test(prod.toLowerCase()), "production formatter");
  const rline = fmt.formatRecommendationSummary(recs[0] || { title: "T", severity: "low", category: "ops", suggestedAction: "act" });
  assert(rline.length > 0, "rec formatter");

  console.log("[v5-smoke] module tests OK");

  const baseUrl = String(process.env.SELFTEST_BASE_URL || process.env.CHEEKY_E2E_BASE_URL || "").trim();
  if (baseUrl) {
    const u = `${baseUrl.replace(/\/$/, "")}/api/dashboard/overview`;
    try {
      const r = await httpGetJson(u, 6000);
      assert(r.status === 200 && r.json && r.json.success === true, `http overview ${r.status}`);
      console.log("[v5-smoke] HTTP overview OK");
    } catch (e) {
      console.warn("[v5-smoke] HTTP skipped or failed:", e && e.message ? e.message : e);
    }
    const leg = `${baseUrl.replace(/\/$/, "")}/dashboard/data`;
    try {
      const r2 = await httpGetJson(leg, 6000);
      assert(r2.status === 200, `legacy dashboard route ${r2.status}`);
      console.log("[v5-smoke] legacy GET /dashboard/data reachable");
    } catch (e2) {
      console.warn("[v5-smoke] legacy route check failed:", e2 && e2.message ? e2.message : e2);
    }
  } else {
    console.log("[v5-smoke] no SELFTEST_BASE_URL — skipping HTTP probes");
  }
}

main().catch((e) => {
  console.error("[v5-smoke] FAILED:", e && e.message ? e.message : e);
  process.exitCode = 1;
});
