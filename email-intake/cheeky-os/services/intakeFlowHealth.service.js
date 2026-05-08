"use strict";

/**
 * CHEEKY OS v3.1 — Intake pipe self-test (POST /api/intake universal → POST /api/intake/ai-parse → GET /api/operator/queue).
 * Used by scripts/cheekyOsIntakeE2eProbe.js and optionally after HTTP listen.
 */

async function fetchJsonSafe(baseUrl, rel, init = {}) {
  const bu = String(baseUrl || "").replace(/\/$/, "");
  const url = bu + rel;
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;
    try {
      data = text && String(text).trim() ? JSON.parse(text) : null;
    } catch (_) {
      data = { __nonJson: text.slice(0, 900) };
    }
    return {
      transportOk: true,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - t0,
      data,
      url,
    };
  } catch (e) {
    return {
      transportOk: false,
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: e && e.message ? e.message : String(e),
      url,
    };
  }
}

function summarizeFetch(r, maxLen) {
  const cap = maxLen || 620;
  if (!r.transportOk) return String(r.error || "").slice(0, cap);
  const d = r.data || {};
  const bits = [`http=${r.status}`, `ms=${r.ms}`];
  if (d && typeof d === "object" && d.ok === false && d.error) bits.push(`err=${String(d.error).slice(0, 180)}`);
  if (d && typeof d === "object" && d.code) bits.push(`code=${d.code}`);
  if (d && typeof d === "object" && d.detail) bits.push(`detail=${String(d.detail).slice(0, 160)}`);
  return bits.join(" · ").slice(0, cap);
}

/**
 * Runs the canonical v3.1 probes against a listening server base URL (http://127.0.0.1:PORT).
 * @returns {Promise<object>}
 */
async function probeIntakeV31Pipeline(baseUrl) {
  const bu = String(baseUrl || "").replace(/\/$/, "");
  const result = {
    baseUrl: bu,
    steps: [],
    stable: false,
    message: "",
    env: {},
  };

  const stamp = `${Date.now()}`;
  const postBody = {
    customer_name: `v3.1 E2E ${stamp}`.slice(0, 100),
    request_text: `${stamp} qty 48 Gildan shirts DTF chest print E2E check`,
    source: `e2e_${stamp}`,
  };

  const r1 = await fetchJsonSafe(bu, "/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postBody),
  });
  const intakePass =
    r1.transportOk &&
    r1.ok &&
    r1.data &&
    typeof r1.data === "object" &&
    r1.data.ok === true;
  result.steps.push({
    name: "POST /api/intake (universal)",
    pass: intakePass,
    detail: summarizeFetch(r1),
  });

  const intakeId =
    r1.data && r1.data.intake_id != null ? String(r1.data.intake_id).trim() : "";

  let aiParsePass = false;
  if (!intakeId) {
    result.steps.push({
      name: "POST /api/intake/ai-parse",
      pass: false,
      detail: "no intake_id returned from intake step",
    });
  } else if (!String(process.env.OPENAI_API_KEY || "").trim()) {
    aiParsePass = true;
    result.steps.push({
      name: "POST /api/intake/ai-parse",
      pass: true,
      detail: "SKIP (OPENAI_API_KEY unset — set for full AI leg)",
      skipped: true,
    });
  } else {
    const r2 = await fetchJsonSafe(bu, "/api/intake/ai-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake_id: intakeId, force: false }),
    });
    const bodyOk =
      r2.transportOk &&
      r2.ok &&
      r2.data &&
      typeof r2.data === "object" &&
      (r2.data.ok === true || r2.data.skipped === true);
    aiParsePass = bodyOk;
    result.steps.push({
      name: "POST /api/intake/ai-parse",
      pass: aiParsePass,
      detail: summarizeFetch(r2),
    });
  }

  const r3 = await fetchJsonSafe(bu, "/api/operator/queue", { method: "GET" });
  const queuePass =
    r3.transportOk &&
    r3.ok &&
    r3.data &&
    typeof r3.data === "object" &&
    r3.data.ok !== false &&
    Array.isArray(r3.data.jobs);
  result.steps.push({
    name: "GET /api/operator/queue",
    pass: queuePass,
    detail: summarizeFetch(r3),
  });

  /** Live worker snapshot (same source as `GET /health`). */
  let workerSnap = {};
  const rHealth = await fetchJsonSafe(bu, "/health", { method: "GET" });
  if (
    rHealth.transportOk &&
    rHealth.ok &&
    rHealth.data &&
    rHealth.data.observability &&
    rHealth.data.observability.worker
  ) {
    workerSnap = { ...rHealth.data.observability.worker };
  }

  try {
    const obs = require("./cheekyOsRuntimeObservability.service");
    const W = obs._workerState();
    const breakerClosed = !(workerSnap.breakerOpenUntil && Date.now() < workerSnap.breakerOpenUntil);
    const workerHealthy = !workerSnap.enabled || (!!workerSnap.running && breakerClosed);
    W.selfTestPass = !!(intakePass && aiParsePass && queuePass && (!workerSnap.enabled || workerHealthy));
  } catch (_) {
    /* optional */
  }

  result.worker = workerSnap;

  result.env.openaiConfigured = !!String(process.env.OPENAI_API_KEY || "").trim();
  result.env.dataverseConfigured = !!(
    process.env.DATAVERSE_URL &&
    process.env.DATAVERSE_CLIENT_ID &&
    process.env.DATAVERSE_CLIENT_SECRET &&
    process.env.DATAVERSE_TENANT_ID
  );

  result.stable = intakePass && aiParsePass && queuePass;

  const breakerClosedFinal = !(workerSnap.breakerOpenUntil && Date.now() < workerSnap.breakerOpenUntil);
  const workerHealthyFinal =
    !workerSnap.enabled || (!!workerSnap.running && breakerClosedFinal);

  if (result.stable) {
    if (workerSnap.enabled && workerHealthyFinal) {
      result.message = "CHEEKY OS UNLOCKED — v4.3 Production Ready";
    } else if (workerSnap.enabled) {
      result.message =
        "CHEEKY OS UNLOCKED — v4.3 Production Ready (worker recovering — check breaker / logs)";
    } else {
      result.message =
        "CHEEKY OS UNLOCKED — v4.3 STABLE (WORKER_ENABLED=false — autonomous operator idle)";
    }
  } else {
    result.message = "CHEEKY OS v4.3 intake probe: NOT STABLE — fix failing steps (see logs)";
    console.log(
      "[intake-flow v3.1] If errors cite Dataverse properties (e.g. cr2d1_*), set CHEEKY_DV_INTAKE_*_LOGICALNAME / TAIL to match Maker — cheeky-os/services/dvPublisherColumns.service.js. To skip this probe locally: CHEEKY_OS_BOOT_INTAKE_SELFTEST=false"
    );
  }

  if (!result.env.openaiConfigured && result.stable) {
    result.message += " · AI parse skipped (OPENAI unset)";
  }

  return result;
}

async function logIntakeV31StartupProbe(baseUrl) {
  try {
    const bootSelfTestRaw = String(process.env.CHEEKY_OS_BOOT_INTAKE_SELFTEST || "").trim().toLowerCase();
    const bootSelfTestLegacyRaw = String(process.env.CHEKY_OS_BOOT_INTAKE_SELFTEST || "").trim().toLowerCase();
    const bootSelfTestEnabled = bootSelfTestRaw === "true" || bootSelfTestLegacyRaw === "true";

    if (
      !bootSelfTestEnabled ||
      bootSelfTestRaw === "false" ||
      bootSelfTestLegacyRaw === "false"
    ) {
      console.log(
        "[intake-flow v3.1] boot self-test skipped (set CHEEKY_OS_BOOT_INTAKE_SELFTEST=true to force startup probe)"
      );
      return null;
    }
    if (!String(process.env.DATAVERSE_URL || "").trim()) {
      console.log("[intake-flow v3.1] boot self-test SKIP (DATAVERSE_URL unset)");
      return null;
    }

    const r = await probeIntakeV31Pipeline(baseUrl);
    console.log((r.stable ? "✅ " : "") + `${r.message} · probe=${baseUrl}`);
    const ws = r.worker || {};
    const workerLineActive = !!(ws.enabled && ws.running && !(ws.breakerOpenUntil && Date.now() < ws.breakerOpenUntil));
    console.log(
      `🚀 Operator Worker ${ws.enabled ? (workerLineActive ? "active" : "warming") : "idle"} | Self-test: ${r.stable ? "PASS" : "FAIL"}`
    );
    for (const s of r.steps) {
      console.log(
        `[intake-flow v3.1]   ${s.pass ? "PASS" : "FAIL"} ${s.name} — ${s.detail || ""}`
      );
    }
    return r;
  } catch (e) {
    console.warn(
      "[intake-flow v3.1] probe error:",
      e && e.message ? e.message : String(e)
    );
    return null;
  }
}

module.exports = {
  probeIntakeV31Pipeline,
  fetchJsonSafe,
  logIntakeV31StartupProbe,
};
