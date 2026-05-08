#!/usr/bin/env node
"use strict";

/**
 * Verifies POST /api/intake → POST /api/intake/ai-parse → GET /api/operator/queue
 * Requires a running cheeky-os server (loads email-intake/.env).
 *
 * Usage:
 *   npm run intake-e2e
 *   node -r ./scripts/cheekyOsLoadEnv.js ./scripts/cheekyOsIntakeE2eProbe.js -- http://127.0.0.1:3050
 */
require("./cheekyOsLoadEnv");
const path = require("path");
const { probeIntakeV31Pipeline } = require(path.join(__dirname, "..", "cheeky-os", "services", "intakeFlowHealth.service"));

function argvBaseUrl() {
  const i = process.argv.indexOf("--");
  const arg = i >= 0 ? process.argv[i + 1] : "";
  const fromFlag = typeof arg === "string" ? arg.trim() : "";
  if (fromFlag) return fromFlag.replace(/\/$/, "");
  const env = String(process.env.CHEEKY_E2E_BASE_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  const p = Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
  return `http://127.0.0.1:${Number.isFinite(p) ? p : 3000}`;
}

async function main() {
  const base = argvBaseUrl();
  console.log(`[intake-e2e] baseUrl=${base}`);
  const r = await probeIntakeV31Pipeline(base);
  console.log(`STATUS ${r.stable ? "PASS" : "FAIL"}`);
  console.log(r.message);
  for (const s of r.steps) {
    console.log(`  [${s.pass ? "PASS" : "FAIL"}] ${s.name} · ${s.detail || ""}`);
  }

  try {
    const mres = await fetch(`${base.replace(/\/$/, "")}/metrics`);
    const mtxt = await mres.text();
    const prometheusOk =
      mres.ok && typeof mtxt === "string" && mtxt.includes("cheeky_os_uptime_seconds");

    let jsonOk = false;
    try {
      const jres = await fetch(`${base.replace(/\/$/, "")}/metrics?format=json`);
      const jtxt = await jres.text();
      const jo = JSON.parse(jtxt);
      jsonOk =
        jres.ok && jo && jo.ok === true && jo.observability && typeof jo.observability.worker === "object";
    } catch (_) {
      jsonOk = false;
    }

    console.log(
      `[intake-e2e] GET /metrics prometheus=${prometheusOk ? "ok" : "missing"} GET /metrics?format=json=${jsonOk ? "ok" : "fail"}`
    );
    /** Non-fatal: surface worker pipeline state even if Prometheus endpoint changes */
    if (!prometheusOk && !jsonOk) {
      console.warn("[intake-e2e] WARN: metrics endpoints unreachable or unexpected format");
    }
  } catch (me) {
    console.warn("[intake-e2e] WARN: /metrics probe error:", me && me.message ? me.message : String(me));
  }

  try {
    const hres = await fetch(`${base.replace(/\/$/, "")}/health`);
    const htxt = await hres.text();
    let hj = null;
    try {
      hj = htxt ? JSON.parse(htxt) : null;
    } catch (_) {}
    const w = (hj && hj.observability && hj.observability.worker) || r.worker || {};
    console.log(
      `[intake-e2e] GET /health worker enabled=${Boolean(w.enabled)} running=${Boolean(
        w.running
      )} polls=${Number(w.polls || 0)} jobsProcessed=${Number(w.jobsProcessed || 0)}`
    );
    const admin = String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
    if (admin) {
      const rr = await fetch(`${base.replace(/\/$/, "")}/admin/restart-worker`, {
        method: "POST",
        headers: { "X-Cheeky-Admin-Key": admin, "Content-Type": "application/json" },
      });
      console.log(`[intake-e2e] POST /admin/restart-worker http=${rr.status}`);
    }
  } catch (_) {
    /* ignore */
  }

  process.exitCode = r.stable ? 0 : 1;
}

main().catch((e) => {
  console.error("[intake-e2e]", e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
