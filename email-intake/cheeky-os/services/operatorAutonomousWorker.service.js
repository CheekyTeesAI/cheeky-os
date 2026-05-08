"use strict";

/**
 * CHEEKY OS v3.3 — Autonomous operator worker: drains Dataverse intake print queue locally.
 *
 * ENV:
 *   WORKER_ENABLED=true|false (default false)
 *   WORKER_POLL_INTERVAL_MS=15000–30000 (default 20000)
 *   MAX_JOB_RETRIES=3
 *   AUTO_HEAL_ENABLED=true|false (default true — restarts timer after uncaught ticks)
 *   WORKER_BREAKER_THRESHOLD=6 — consecutive failing queue polls opens circuit briefly
 *   WORKER_BREAKER_COOLDOWN_MS=60000
 */

const path = require("path");
const dvStore = require(path.join(__dirname, "..", "data", "dataverse-store"));
const ctSync = require(path.join(__dirname, "ctSync.service"));
const { runIntakeBrainParse } = require(path.join(__dirname, "cheekyIntakeBrain.service"));

function workerEnabledEnv() {
  const s = String(process.env.WORKER_ENABLED || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

let _workerShuttingDown = false;

function autoHealEnv() {
  const raw = String(process.env.AUTO_HEAL_ENABLED || "").trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}

function pollIntervalMs() {
  let n = parseInt(String(process.env.WORKER_POLL_INTERVAL_MS || "20000"), 10);
  if (!Number.isFinite(n) || n < 5000) n = 20000;
  if (n > 120000) n = 120000;
  return n;
}

function maxJobRetries() {
  let n = parseInt(String(process.env.MAX_JOB_RETRIES || "3"), 10);
  if (!Number.isFinite(n) || n < 0) return 3;
  if (n > 15) return 15;
  return n;
}

function breakerThreshold() {
  let n = parseInt(String(process.env.WORKER_BREAKER_THRESHOLD || "6"), 10);
  if (!Number.isFinite(n) || n < 2) return 6;
  return Math.min(n, 50);
}

function breakerCooldownMs() {
  let n = parseInt(String(process.env.WORKER_BREAKER_COOLDOWN_MS || "60000"), 10);
  if (!Number.isFinite(n) || n < 5000) return 60000;
  return Math.min(n, 600000);
}

let timer = null;

/** @type {Map<string, { state: string; attempts: number; lastDetail?: string; updatedAt: string }>} */
const lifecycles = new Map();

function obs() {
  return require("./cheekyOsRuntimeObservability.service");
}

function ws() {
  return obs()._workerState();
}

let _dedupSeen = new Map();

function dedupWorkerTtlMs() {
  let n = parseInt(String(process.env.CHEEKY_WORKER_DEDUP_MS || "120000"), 10);
  if (!Number.isFinite(n)) return 120000;
  return Math.max(5000, Math.min(n, 3600000));
}

function pruneDedupMap() {
  const now = Date.now();
  const ttl = dedupWorkerTtlMs();
  for (const [k, at] of _dedupSeen) {
    if (now - at > ttl) _dedupSeen.delete(k);
  }
}

/** intakeId + status + gate_token — TTL ring for horizontal worker dedupe */
function dedupShouldSkip(job) {
  pruneDedupMap();
  const intakeId =
    job && job.orderId != null && String(job.orderId).trim()
      ? String(job.orderId).trim()
      : null;
  if (!intakeId) return false;
  const st = String(job.status || "").toUpperCase();
  const gt = job.gateToken != null ? String(job.gateToken).trim().slice(0, 80) : "";
  const key = `${intakeId}|${st}|${gt}`;
  const now = Date.now();
  const prev = _dedupSeen.get(key);
  if (prev != null && now - prev < dedupWorkerTtlMs()) return true;
  _dedupSeen.set(key, now);
  return false;
}

async function loadPrintQueueJobs() {
  const modPath = path.join(__dirname, "..", "..", "dist", "services", "intakeQueuePrintingService.js");
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(modPath);
    if (typeof mod.listIntakesEligibleForPrinting === "function") {
      return mod.listIntakesEligibleForPrinting();
    }
  } catch (e) {
    return {
      ok: false,
      error: `intake_queue_module_load_failed:${e && e.message ? e.message : String(e)}`,
    };
  }
  return { ok: false, error: "missing_listIntakesEligibleForPrinting" };
}

async function processOne(job) {
  const intakeId =
    job && job.orderId != null && String(job.orderId).trim()
      ? String(job.orderId).trim()
      : null;
  if (!intakeId || !/^[0-9a-fA-F-]{36}$/.test(intakeId)) {
    return { ok: false, skipped: true, reason: "invalid_intake_id" };
  }

  if (dedupShouldSkip(job)) {
    return { ok: true, skipped: true, incrementWork: false, reason: "dedup_gate_ttl" };
  }

  let cell = lifecycles.get(intakeId) || {
    state: "queued",
    attempts: 0,
    updatedAt: new Date().toISOString(),
  };
  if (["completed", "failed_terminal", "skipped"].includes(cell.state)) {
    return { ok: true, skipped: true, incrementWork: false, detail: cell.state };
  }

  cell = { ...cell, state: "processing", updatedAt: new Date().toISOString() };
  lifecycles.set(intakeId, cell);

  obs().noteJobLifecycle({
    intakeId,
    customer: String(job.customer || "").slice(0, 120),
    statusLabel: String(job.status || "").slice(0, 80),
    lifecycle: "processing",
    at: cell.updatedAt,
  });

  const st = String(job.status || "").toUpperCase();

  try {
    if (st === "INTAKE_NEW") {
      const out = await runIntakeBrainParse(intakeId, { force: false });
      const skipped = !!(out && out.skipped);
      const success = !!(out && out.ok);

      let attempts = cell.attempts;
      let lastDetail =
        skipped
          ? String((out && out.reason) || "skipped").slice(0, 280)
          : success
            ? "brain_ok"
            : String((out && out.error) || "brain_failed").slice(0, 280);

      let nextState = "completed";
      if (skipped || success) {
        nextState = "completed";
      } else {
        attempts += 1;
        const cap = maxJobRetries();
        if (attempts > cap) {
          nextState = "failed_terminal";
        } else {
          nextState = "queued";
          lastDetail = `${lastDetail}|retry_${attempts}_of_${cap}`;
        }
      }

      cell = {
        state: nextState,
        attempts,
        lastDetail,
        updatedAt: new Date().toISOString(),
      };
      lifecycles.set(intakeId, cell);

      const auditName =
        skipped
          ? "OPERATOR_JOB_SKIPPED_BRAIN"
          : success
            ? "OPERATOR_JOB_BRAIN_DONE"
            : nextState === "failed_terminal"
              ? "OPERATOR_JOB_DEAD_LETTER"
              : "OPERATOR_JOB_BRAIN_FAIL";

      await ctSync
        .writeAuditEvent({
          name: auditName,
          message: JSON.stringify({
            intakeId,
            status: job.status,
            brain: out,
            attempts,
          }).slice(0, 11000),
          eventType: "NODE_SYNC",
          severity: skipped || success ? "INFO" : nextState === "failed_terminal" ? "HIGH" : "WARN",
          actor: "system:operator-autonomous-worker-v33",
          relatedIntakeId: intakeId,
        })
        .catch(() => {});

      obs().noteJobLifecycle({
        intakeId,
        customer: String(job.customer || "").slice(0, 120),
        statusLabel: st,
        lifecycle: cell.state,
        at: cell.updatedAt,
        detail: cell.lastDetail,
      });

      const okReturned = nextState !== "failed_terminal";
      const incrementWork = !!(success || skipped);

      return {
        ok: okReturned,
        skipped,
        deferredRetry: nextState === "queued",
        incrementWork,
        detail: cell.lastDetail,
      };
    }

    /** AI_PARSED — attach audit breadcrumb only (printing path may be human-driven). */
    if (st === "AI_PARSED") {
      await ctSync
        .writeAuditEvent({
          name: "OPERATOR_QUEUE_AI_PARSED_SEEN",
          message: JSON.stringify({
            intakeId,
            customer: job.customer || "",
            snippet: String(job.requestText || "").slice(0, 2000),
          }).slice(0, 11800),
          eventType: "NODE_SYNC",
          severity: "INFO",
          actor: "system:operator-autonomous-worker-v33",
          relatedIntakeId: intakeId,
        })
        .catch(() => {});
      cell = {
        state: "completed",
        attempts: cell.attempts,
        updatedAt: new Date().toISOString(),
        lastDetail: "ai_parsed_ack",
      };
      lifecycles.set(intakeId, cell);
      obs().noteJobLifecycle({
        intakeId,
        customer: String(job.customer || "").slice(0, 120),
        statusLabel: st,
        lifecycle: "completed",
        at: cell.updatedAt,
        detail: "ai_parsed_ack",
      });
      return {
        ok: true,
        skipped: true,
        incrementWork: true,
        detail: "ai_parsed_ack",
      };
    }

    cell = {
      ...cell,
      state: "skipped",
      lastDetail: `status_not_handled:${st}`,
      updatedAt: new Date().toISOString(),
    };
    lifecycles.set(intakeId, cell);
    return { ok: false, skipped: true, reason: cell.lastDetail };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    cell = {
      state: cell.attempts + 1 > maxJobRetries() ? "failed_terminal" : "queued",
      attempts: cell.attempts + 1,
      lastDetail: msg.slice(0, 300),
      updatedAt: new Date().toISOString(),
    };
    lifecycles.set(intakeId, cell);
    await ctSync
      .writeAuditEvent({
        name: "OPERATOR_JOB_EXCEPTION",
        message: `${intakeId}: ${msg}`.slice(0, 10000),
        eventType: "NODE_SYNC",
        severity: "HIGH",
        actor: "system:operator-autonomous-worker-v33",
        relatedIntakeId: intakeId,
      })
      .catch(() => {});
    return { ok: false, error: msg };
  }
}

async function runOnePollLoop() {
  if (_workerShuttingDown) return;
  const W = ws();
  W.lastLoopIso = new Date().toISOString();
  if (Date.now() < W.breakerOpenUntil) {
    W.lastLoopError = "circuit_breaker_open";
    W.ticksFailed += 1;
    return;
  }

  if (!dvStore.isConfigured()) {
    W.lastLoopError = "dataverse_not_configured_worker_idle";
    W.ticksOk += 1;
    obs().noteQueuePoll(0, false, W.lastLoopError);
    return;
  }

  W.polls += 1;

  try {
    const out = await loadPrintQueueJobs();
    const depth = (out.jobs || []).length;
    if (!out.ok) {
      W.consecutivePollFailures += 1;
      W.ticksFailed += 1;
      W.lastLoopError = out.error || "queue_failed";
      obs().noteQueuePoll(depth || 0, false, W.lastLoopError);
      const th = breakerThreshold();
      if (W.consecutivePollFailures >= th) {
        const cool = breakerCooldownMs();
        W.breakerOpenUntil = Date.now() + cool;
        loggerWarn(`[worker-v33] breaker open ${cool}ms after ${th} failures`);
      }
      return;
    }

    W.consecutivePollFailures = 0;
    W.ticksOk += 1;
    W.lastLoopError = null;
    obs().noteQueuePoll(depth, true);

    /* eslint-disable no-await-in-loop */
    for (const job of out.jobs || []) {
      const r = await processOne(job);
      if (r && r.incrementWork) W.jobsProcessed += 1;
      if (!r || r.ok === false) W.jobsFailed += 1;
    }
    /* eslint-enable no-await-in-loop */
  } catch (e) {
    W.ticksFailed += 1;
    W.crashed += 1;
    W.lastLoopError = e instanceof Error ? e.message : String(e);
    obs().noteQueuePoll(0, false, W.lastLoopError);
    loggerWarn(`[worker-v33] tick crash: ${W.lastLoopError}`);
  }
}

function loggerWarn(m) {
  try {
    const { logger } = require(path.join(__dirname, "..", "utils", "logger"));
    logger.warn(m);
  } catch (_) {
    console.warn(m);
  }
}

function scheduleNext(delayOverride) {
  const W = ws();
  if (_workerShuttingDown) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const base = pollIntervalMs() + (W.backoffMs || 0);
  const delay =
    typeof delayOverride === "number" && Number.isFinite(delayOverride) ? delayOverride : base;
  timer = setTimeout(async () => {
    try {
      await runOnePollLoop();
    } finally {
      if (
        !_workerShuttingDown &&
        autoHealEnv() &&
        workerEnabledEnv() &&
        ws().running
      ) {
        scheduleNext();
      }
    }
  }, Math.max(delay, 2000));
}

function startOperatorAutonomousWorker() {
  _workerShuttingDown = false;
  const W = ws();
  if (W.running) return;
  if (!workerEnabledEnv()) {
    W.enabled = false;
    W.running = false;
    console.log(
      "[operator-worker v3.3] disabled — set WORKER_ENABLED=true (+ DATAVERSE_* + npm run build for intake queue TS)"
    );
    return;
  }

  if (!dvStore.isConfigured()) {
    console.warn("[operator-worker v3.3] WORKER_ENABLED but Dataverse unset — idle polling");
  }

  W.enabled = true;
  W.running = true;
  W.backoffMs = 0;

  console.log(
    `[operator-worker v3.3] started interval≈${pollIntervalMs()}ms maxJobRetries=${maxJobRetries()} breaker=${breakerThreshold()} autoHeal=${autoHealEnv()}`
  );

  /** First tick soon after boot. */
  scheduleNext(parseInt(String(process.env.WORKER_FIRST_DELAY_MS || "4000"), 10) || 4000);
}

function stopOperatorAutonomousWorkerGraceful() {
  _workerShuttingDown = true;
  const W = ws();
  W.running = false;
  W.enabled = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Stop + restart timer (same process). Used by admin API. */
function restartOperatorWorker() {
  stopOperatorAutonomousWorkerGraceful();
  _workerShuttingDown = false;
  startOperatorAutonomousWorker();
  return ws();
}

module.exports = {
  startOperatorAutonomousWorker,
  stopOperatorAutonomousWorkerGraceful,
  restartOperatorWorker,
  runOnePollLoop,
  workerEnabledEnv,
  /** @internal metrics */
  getLifecyclePreview: () => Array.from(lifecycles.entries()).slice(-40),
};
