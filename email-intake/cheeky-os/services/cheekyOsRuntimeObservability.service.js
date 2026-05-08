"use strict";

/**
 * CHEEKY OS runtime metrics — v4.1 (rings for dashboard + health).
 */

const MAX_RECENT_QUEUE = Number(process.env.CHEEKY_OBS_RECENT_QUEUE_MAX || "24") || 24;

const state = {
  intakeAcceptedCount: 0,
  /** @type {string|null} */
  lastIntakeIso: null,
  externalRetryAttempts: 0,
  odataFailures: 0,
  /** @type {{ at: string; depth: number; ok: boolean; error?: string }[]} */
  recentQueueSnapshots: [],
  /** @type {{ intakeId: string|null; customer: string; statusLabel: string; lifecycle: string; at: string; detail?: string }[]} */
  recentJobs: [],
  /** @type {{ at: string; customer: string; source: string; duplicate?: boolean; intakeId?: string|null }[]} */
  recentIntakes: [],
  /** @type {{ at: string; name: string; severity: string; actor: string }[]} */
  recentAuditBrief: [],
  /** @type {Map<string, { name: string; schedule: string; intervalMs: number|null; lastRun: string|null; nextRun: string|null }>} */
  crons: new Map(),
  worker: {
    enabled: false,
    running: false,
    polls: 0,
    ticksOk: 0,
    ticksFailed: 0,
    breakerOpenUntil: 0,
    consecutivePollFailures: 0,
    /** @type {string|null} */
    lastLoopIso: null,
    /** @type {string|null} */
    lastLoopError: null,
    crashed: 0,
    backoffMs: 0,
    jobsProcessed: 0,
    jobsFailed: 0,
    selfTestPass: false,
  },
};

function pushRing(arr, item, max) {
  arr.push(item);
  while (arr.length > max) arr.shift();
}

function recordIntakeAccepted() {
  state.intakeAcceptedCount += 1;
  state.lastIntakeIso = new Date().toISOString();
}

/**
 * Brief row for dashboard “recent intakes”.
 * @param {{ customer?: string; source?: string; duplicate?: boolean; intakeId?: string|null }} row
 */
function noteRecentUniversalIntake(row) {
  pushRing(
    state.recentIntakes,
    {
      at: new Date().toISOString(),
      customer: String(row.customer || "").slice(0, 120),
      source: String(row.source || "").slice(0, 80),
      duplicate: !!row.duplicate,
      intakeId: row.intakeId != null ? String(row.intakeId) : null,
    },
    MAX_RECENT_QUEUE
  );
}

function noteAuditEventBrief(row) {
  pushRing(
    state.recentAuditBrief,
    {
      at: new Date().toISOString(),
      name: String(row.name || "").slice(0, 160),
      severity: String(row.severity || "").slice(0, 40),
      actor: String(row.actor || "").slice(0, 120),
    },
    MAX_RECENT_QUEUE
  );
}

function recordExternalRetry() {
  state.externalRetryAttempts += 1;
}

function recordODataFailureLogged() {
  state.odataFailures += 1;
}

function noteQueuePoll(depth, ok, error) {
  pushRing(
    state.recentQueueSnapshots,
    {
      at: new Date().toISOString(),
      depth: depth | 0,
      ok,
      error: error || undefined,
    },
    MAX_RECENT_QUEUE
  );
}

function noteJobLifecycle(row) {
  pushRing(state.recentJobs, row, MAX_RECENT_QUEUE);
}

/**
 * @param {string} name
 * @param {string} schedule Human-readable schedule
 * @param {number|null} intervalMs When set, nextRun is derived after each tick
 */
function registerCron(name, schedule, intervalMs) {
  const key = String(name || "").trim();
  if (!key) return;
  if (state.crons.has(key)) {
    console.log("[CRON][REGISTERED] " + key + " (already registered, skip)");
    return;
  }
  state.crons.set(key, {
    name: key,
    schedule: String(schedule || ""),
    intervalMs: intervalMs != null && Number.isFinite(Number(intervalMs)) ? Number(intervalMs) : null,
    lastRun: null,
    nextRun: null,
  });
  console.log("[CRON][REGISTERED] " + key + " schedule=" + String(schedule || ""));
}

/**
 * @param {string} name
 */
function noteCronRun(name) {
  const key = String(name || "").trim();
  const c = state.crons.get(key);
  if (!c) return;
  const now = Date.now();
  c.lastRun = new Date().toISOString();
  if (c.intervalMs && c.intervalMs > 0) {
    c.nextRun = new Date(now + c.intervalMs).toISOString();
  }
}

function getActiveCronsForHealth() {
  return Array.from(state.crons.values()).map((x) => ({
    name: x.name,
    schedule: x.schedule,
    lastRun: x.lastRun,
    nextRun: x.nextRun,
  }));
}

function getWorkerSnapshotForHealth() {
  return { ...state.worker };
}

function getObservabilitySnapshot() {
  return {
    uptimeSec: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || "development",
    intake: {
      acceptedCount: state.intakeAcceptedCount,
      lastAt: state.lastIntakeIso,
    },
    resiliency: {
      externalHttpRetriesRecorded: state.externalRetryAttempts,
      odataFailuresObserved: state.odataFailures,
    },
    operatorQueueRecent: state.recentQueueSnapshots.slice(-12),
    recentOperatorJobs: state.recentJobs.slice(-12),
    recentIntakes: state.recentIntakes.slice(-16),
    recentAuditEvents: state.recentAuditBrief.slice(-20),
    worker: getWorkerSnapshotForHealth(),
    activeCrons: getActiveCronsForHealth(),
    version: {
      cheeky_os: "4.3",
      layer: "v41-observability",
    },
    scaling: {
      worker_stateless_hint: !!String(process.env.CHEEKY_WORKER_STATELESS || "").match(
        /^(1|true|on|yes)$/i
      ),
      dataverse_profile: String(process.env.CHEEKY_DATAVERSE_PROFILE || "").trim() || "default",
    },
  };
}

module.exports = {
  recordIntakeAccepted,
  noteRecentUniversalIntake,
  noteAuditEventBrief,
  recordExternalRetry,
  recordODataFailureLogged,
  noteQueuePoll,
  noteJobLifecycle,
  registerCron,
  noteCronRun,
  getObservabilitySnapshot,
  /** @internal */
  _workerState() {
    return state.worker;
  },
};
