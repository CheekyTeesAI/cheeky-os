/**
 * Bundle 43 — daily / weekly goals vs KPI actuals (in-memory targets only).
 */

const { getFounderKpiSnapshot } = require("./kpiService");

const DEFAULT_TARGETS = {
  daily: {
    followups: 10,
    invoices: 5,
    productionMoves: 8,
  },
  weekly: {
    followups: 50,
    invoices: 25,
    productionMoves: 40,
  },
};

/** @type {null | { daily?: object, weekly?: object }} */
let overrides = null;

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function clampInt(n, fallback) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x) || x < 0) return fallback;
  return x;
}

function getEffectiveTargets() {
  const out = clone(DEFAULT_TARGETS);
  if (!overrides || typeof overrides !== "object") return out;
  if (overrides.daily && typeof overrides.daily === "object") {
    for (const k of ["followups", "invoices", "productionMoves"]) {
      if (overrides.daily[k] != null) {
        out.daily[k] = clampInt(overrides.daily[k], out.daily[k]);
      }
    }
  }
  if (overrides.weekly && typeof overrides.weekly === "object") {
    for (const k of ["followups", "invoices", "productionMoves"]) {
      if (overrides.weekly[k] != null) {
        out.weekly[k] = clampInt(overrides.weekly[k], out.weekly[k]);
      }
    }
  }
  return out;
}

/**
 * @param {number} actual
 * @param {number} target
 * @returns {{ target: number, actual: number, status: "ahead" | "on_track" | "behind" }}
 */
function evaluateMetric(actual, target) {
  const a = Math.max(0, Math.floor(Number(actual) || 0));
  const t = Math.max(0, Math.floor(Number(target) || 0));
  if (t <= 0) {
    return {
      target: t,
      actual: a,
      status: a > 0 ? "ahead" : "on_track",
    };
  }
  if (a >= t) {
    return { target: t, actual: a, status: "ahead" };
  }
  if (a >= 0.6 * t) {
    return { target: t, actual: a, status: "on_track" };
  }
  return { target: t, actual: a, status: "behind" };
}

/**
 * Merge partial targets (in-memory). Safe — never throws.
 * @param {object} body
 */
function updateGoalsTargets(body) {
  if (!body || typeof body !== "object") return;
  overrides = overrides || { daily: {}, weekly: {} };
  const d = body.daily;
  const w = body.weekly;
  if (d && typeof d === "object") {
    overrides.daily = { ...overrides.daily, ...d };
  }
  if (w && typeof w === "object") {
    overrides.weekly = { ...overrides.weekly, ...w };
  }
}

/**
 * @returns {Promise<{
 *   kpiAvailable: boolean,
 *   daily: object,
 *   weekly: object
 * }>}
 */
async function getGoalsStatus() {
  /** @type {object | null} */
  let kpi = null;
  let kpiAvailable = true;
  try {
    kpi = await getFounderKpiSnapshot();
  } catch (_) {
    kpiAvailable = false;
    kpi = { today: {}, week: {} };
  }
  if (!kpi || typeof kpi !== "object") {
    kpiAvailable = false;
    kpi = { today: {}, week: {} };
  }

  const t = getEffectiveTargets();
  const today = kpi.today && typeof kpi.today === "object" ? kpi.today : {};
  const week = kpi.week && typeof kpi.week === "object" ? kpi.week : {};

  return {
    kpiAvailable,
    daily: {
      followups: evaluateMetric(today.followupsSent, t.daily.followups),
      invoices: evaluateMetric(today.draftInvoicesCreated, t.daily.invoices),
      productionMoves: evaluateMetric(today.productionMoves, t.daily.productionMoves),
    },
    weekly: {
      followups: evaluateMetric(week.followupsSent, t.weekly.followups),
      invoices: evaluateMetric(week.draftInvoicesCreated, t.weekly.invoices),
      productionMoves: evaluateMetric(week.productionMoves, t.weekly.productionMoves),
    },
  };
}

module.exports = {
  getGoalsStatus,
  updateGoalsTargets,
  getEffectiveTargets,
  DEFAULT_TARGETS,
};
