"use strict";

/**
 * Power Apps — tile payload for GET /api/cheeky-os/dashboard-data (`tiles`).
 * Cheeky OS v4.3 — normalized integers, HealthSummary, capped Notes for production clients.
 * Tiles are sourced only from dashboard summary (live → cache → safe zeros).
 */

const dashboardSummaryService = require("./dashboardSummaryService");

/**
 * @param {string[]} notes
 * @param {unknown} err
 */
function maybePushSchemaDriftNote(notes, err) {
  const m = err && err.message ? String(err.message) : String(err);
  if (/does not exist in the current database|P2022|Unknown column/i.test(m)) {
    if (!notes.some((n) => String(n).includes("migrations"))) {
      notes.push(
        "Prisma/DB mismatch — apply migrations (`npx prisma migrate deploy` or `db push` from email-intake) so columns match schema.prisma."
      );
    }
  }
}

/** @param {unknown} x */
function n0(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

/**
 * @param {string[]|undefined} arr
 * @param {number} [maxItems]
 * @param {number} [maxLen]
 */
function trimNotesList(arr, maxItems, maxLen) {
  const mi = maxItems || 8;
  const ml = maxLen || 220;
  if (!Array.isArray(arr) || !arr.length) return undefined;
  const out = [];
  const seen = new Set();
  for (const s of arr) {
    const t = String(s).slice(0, ml);
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= mi) break;
  }
  return out.length ? out : undefined;
}

/**
 * Stable numeric tiles + single-line HealthSummary for Power Apps subtitle bindings.
 * @param {object} t
 */
function finalizeTileObject(t) {
  const x = { ...t };
  x.Source = String(x.Source || "unknown");
  x.OrdersOnHold = n0(x.OrdersOnHold);
  x.OrdersWaitingOnArt = n0(x.OrdersWaitingOnArt);
  x.Estimates = n0(x.Estimates);
  x.BlanksNeeded = n0(x.BlanksNeeded);
  x.OrdersNeedingArt = n0(x.OrdersNeedingArt);
  x.QueueDepth = n0(x.QueueDepth);
  x.ActiveJobs = n0(x.ActiveJobs);
  x.TotalOrdersToday = n0(x.TotalOrdersToday);
  x.WorkerStatus = String(x.WorkerStatus || "Unknown");
  x.GeneratedAt =
    x.GeneratedAt && String(x.GeneratedAt).trim() ? String(x.GeneratedAt) : new Date().toISOString();
  x.LastIntakeTime =
    x.LastIntakeTime != null && String(x.LastIntakeTime).trim() ? String(x.LastIntakeTime) : null;
  if (Array.isArray(x.Notes)) x.Notes = trimNotesList(x.Notes);
  const attention =
    x.OrdersOnHold + x.OrdersWaitingOnArt + x.BlanksNeeded + x.OrdersNeedingArt;
  let hs = `source=${x.Source} · worker=${x.WorkerStatus} · queue=${x.QueueDepth} · active=${x.ActiveJobs} · attention=${attention}`;
  if (x.Notes && x.Notes.length) hs += ` · diagnostics=${x.Notes.length}`;
  x.HealthSummary = hs;
  return x;
}

/** @param {object} observability */
function deriveQueueDepth(observability) {
  const obs = observability && typeof observability === "object" ? observability : {};
  const qRecent = obs.operatorQueueRecent || [];
  if (Array.isArray(qRecent) && qRecent.length) {
    const last = qRecent[qRecent.length - 1];
    return Number(last && last.depth != null ? last.depth : 0) || 0;
  }
  return 0;
}

/** @param {object} observability @returns {string|null} */
function deriveLastIntakeTime(observability) {
  const obs = observability && typeof observability === "object" ? observability : {};
  const t = obs.intake && obs.intake.lastAt != null ? String(obs.intake.lastAt).trim() : "";
  return t ? t : null;
}

/** @param {object} observability @returns {string} */
function deriveWorkerStatus(observability) {
  const obs = observability && typeof observability === "object" ? observability : {};
  const w = obs.worker || {};
  const enabled = !!w.enabled;
  const running = !!w.running;
  const breaker = w.breakerOpenUntil && Number(w.breakerOpenUntil) > Date.now();
  const err = String(w.lastLoopError || "").trim();

  if (!enabled) return "Disabled";
  if (!running) return "Stopped";
  if (breaker) return "Recovering";
  if (err) return "Degraded";
  return "Healthy";
}

/**
 * Canonical empty / fallback tile row (same keys as a full summary-backed load).
 * @param {object} [observability]
 * @param {{ Source?: string, Error?: string, Notes?: string[] }} [extra]
 */
function emptyPowerAppsTiles(observability, extra = {}) {
  const obs = observability && typeof observability === "object" ? observability : {};
  const notes = [];
  if (Array.isArray(extra.Notes)) {
    notes.push(...extra.Notes.filter(Boolean).map(String));
  }
  if (extra.Error) notes.unshift(String(extra.Error));

  const base = {
    Source: extra.Source ? String(extra.Source) : "database_unavailable",
    OrdersOnHold: 0,
    OrdersWaitingOnArt: 0,
    Estimates: 0,
    BlanksNeeded: 0,
    OrdersNeedingArt: 0,
    QueueDepth: deriveQueueDepth(obs),
    LastIntakeTime: deriveLastIntakeTime(obs),
    WorkerStatus: deriveWorkerStatus(obs),
    ActiveJobs: 0,
    TotalOrdersToday: 0,
    GeneratedAt: new Date().toISOString(),
  };
  if (notes.length) base.Notes = notes;
  return finalizeTileObject(base);
}

/**
 * @param {{ observability?: object }} [opts]
 * @returns {Promise<object>}
 */
async function loadPowerAppsTiles(opts = {}) {
  try {
    return await loadPowerAppsTilesImpl(opts);
  } catch (fatal) {
    const observability = opts && typeof opts.observability === "object" ? opts.observability : {};
    const msg = fatal && fatal.message ? String(fatal.message) : String(fatal);
    return emptyPowerAppsTiles(observability, {
      Source: "partial",
      Error: "tile_load_fatal:" + msg.slice(0, 400),
    });
  }
}

/**
 * @param {object} summary Envelope from dashboardSummaryService
 * @param {object} observability
 * @param {object} [tileOverrides] Passed into finalize before observability shell fields
 */
function tilesFromSummaryEnvelope(summary, observability, tileOverrides) {
  const d = dashboardSummaryService.ensureFlatSummaryData(summary && summary.data ? summary.data : null);
  const queueDepth = deriveQueueDepth(observability);
  const lastIntakeTime = deriveLastIntakeTime(observability);
  const workerStatus = deriveWorkerStatus(observability);
  const ovr = tileOverrides && typeof tileOverrides === "object" ? tileOverrides : {};
  return finalizeTileObject({
    Source: summary.degradedMode ? "partial" : "prisma",
    OrdersOnHold: n0(d.ordersOnHold),
    OrdersWaitingOnArt: n0(d.artWaiting),
    Estimates: n0(d.estimates),
    BlanksNeeded: n0(d.blanksNeeded),
    OrdersNeedingArt: n0(d.ordersNeedingArt),
    QueueDepth: queueDepth,
    LastIntakeTime: lastIntakeTime,
    WorkerStatus: workerStatus,
    ActiveJobs: n0(d.production),
    TotalOrdersToday: n0(d.totalOrdersToday),
    GeneratedAt: (summary && summary.generatedAt) || new Date().toISOString(),
    Notes: summary.degradedMode ? [String(summary.safeMessage || "summary_degraded").slice(0, 400)] : undefined,
    ...ovr,
  });
}

/**
 * @param {{ observability?: object }} [opts]
 * @returns {Promise<object>}
 */
async function loadPowerAppsTilesImpl(opts = {}) {
  const observability = opts && typeof opts.observability === "object" ? opts.observability : {};

  try {
    const summary = await dashboardSummaryService.buildDashboardSummary();
    const tiles = tilesFromSummaryEnvelope(summary, observability);
    console.warn(
      summary.degradedMode
        ? "[POWERAPPS][DEGRADED] Serving normalized summary-backed tiles"
        : "[DASHBOARD][CACHE] Serving normalized summary-backed tiles"
    );
    return tiles;
  } catch (summaryErr) {
    const notes = [];
    maybePushSchemaDriftNote(notes, summaryErr);
    console.warn(
      "[DASHBOARD][WARN] summary-backed tiles unavailable; trying cache:",
      summaryErr && summaryErr.message ? summaryErr.message : String(summaryErr)
    );
  }

  const cached = dashboardSummaryService.readLastGood();
  if (cached && cached.payload) {
    const summary = { ...cached.payload, degradedMode: true, safeMessage: cached.payload.safeMessage || "Serving tiles from cached dashboard summary." };
    summary.data = dashboardSummaryService.ensureFlatSummaryData(summary.data);
    return tilesFromSummaryEnvelope(summary, observability, {
      Source: "partial",
      Notes: ["tiles_from_cache_dashboard_summary_lastGood"],
    });
  }

  return emptyPowerAppsTiles(observability, {
    Source: "database_unavailable",
    Error: "summary_unavailable_no_cache",
    Notes: ["degradedMode_tile_fallback"],
  });
}

module.exports = {
  loadPowerAppsTiles,
  loadPowerAppsTilesImpl,
  emptyPowerAppsTiles,
  finalizeTileObject,
  deriveWorkerStatus,
  tilesFromSummaryEnvelope,
  maybePushSchemaDriftNote,
};
