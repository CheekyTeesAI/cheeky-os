"use strict";

/**
 * Live Operational Activation v7 — module + connector smoke (read-only).
 *
 * Offline checks: routers load, readiness, trust, Square readiness, Graph healthProbe shape,
 * queue integrity, production workflow summary.
 *
 * Optional HTTP: set CHEEKY_V7_SMOKE_BASE_URL (e.g. http://127.0.0.1:3000) with server running;
 * hits observability + trust + workflow + email status (no writes).
 */

const path = require("path");
process.chdir(path.join(__dirname, ".."));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "fail");
}

async function optionalHttpProbe() {
  const base = String(process.env.CHEEKY_V7_SMOKE_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    console.log("[v7-smoke] skip HTTP (set CHEEKY_V7_SMOKE_BASE_URL to probe live routes)");
    return;
  }
  const headers = { Accept: "application/json" };

  async function get(p) {
    const u = `${base}${p}`;
    const r = await fetch(u, { headers });
    const j = await r.json().catch(() => ({}));
    return { u, status: r.status, j };
  }

  const paths = [
    "/api/observability/readiness",
    "/api/observability/metrics",
    "/api/trust/score",
    "/api/intelligence/email/status",
    "/api/intelligence/workflow/late-production",
  ];
  for (let i = 0; i < paths.length; i++) {
    const out = await get(paths[i]);
    assert(out.status < 500, `http ${out.status} ${out.u}`);
    assert(out.j && out.j.success === true, `json success ${out.u}`);
  }
  console.log("[v7-smoke] HTTP probe ok against", base);
}

async function main() {
  console.log("[v7-smoke] cwd=%s", process.cwd());

  require("../routes/observabilityRoutes");
  require("../routes/trustDashboard");
  require("../routes/operatorWorkflowRoutes");

  const readiness = require("../operator/operatorReadinessCheck");
  const rr = readiness.runActivationReadiness();
  assert(rr && typeof rr.ready === "boolean", "readiness");

  const trust = require("../trust/trustScoringEngine");
  const ts = trust.computeTrustScore();
  assert(typeof ts.overallTrustScore === "number", "trust score");

  const wf = require("../operator/operatorWorkflowEngine");
  const late = wf.workflowLateProductionSummary("v7-smoke");
  assert(late != null, "late production summary");

  const graph = require("../connectors/graphEmailConnector");
  assert(typeof graph.healthProbe === "function", "graph healthProbe");

  const sqMod = require("../connectors/squareReadConnector");
  const sq = await sqMod.readiness();
  assert(sq && typeof sq.authVerified === "boolean", "square readiness");

  const { validateTaskQueueFile } = require("../diagnostics/queueIntegrityGate");
  const qi = validateTaskQueueFile();
  assert(qi && typeof qi.ok === "boolean", "queue integrity");

  const hp = await graph.healthProbe();
  assert(hp && typeof hp.ok === "boolean", "graph probe");

  const metricsCollector = require("../diagnostics/metricsCollector");
  metricsCollector.bumpProcessorRun();

  await optionalHttpProbe();

  console.log("[v7-smoke] OK");
}

main().catch((e) => {
  console.error("[v7-smoke] FAILED:", e && e.message ? e.message : e);
  process.exitCode = 1;
});
