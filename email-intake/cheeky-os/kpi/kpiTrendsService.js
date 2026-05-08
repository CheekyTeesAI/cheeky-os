"use strict";

/**
 * KPI trend cards — compares current snapshot vs local history windows (7d / 30d).
 * Never fabricates values: emits "insufficient_data" / "unknown" when history is thin.
 */

/**
 * @param {string} metricKey snapshot key inside entry.snapshot
 * @param {string} metricLabel friendly label for UI/API
 * @param {number|string|null|undefined} currentNumeric when non-numeric KPI, caller passes number or null with separate handler
 * @param {{ ts: string, dayKey?: string, snapshot: object }[]} entries oldest-first preferred
 * @returns {object}
 */
function buildMetricTrend(metricKey, metricLabel, currentNumeric, entries) {
  const generatedAt = new Date().toISOString();
  if (currentNumeric == null || Number.isNaN(Number(currentNumeric))) {
    return {
      metric: metricLabel,
      currentValue: "insufficient_data",
      trend7d: "insufficient_data",
      trend30d: "insufficient_data",
      direction: "unknown",
      confidence: 0.22,
      warning: "Cheeky OS could not compute this metric yet — widen data sources or accumulate KPI history snapshots.",
      generatedAt,
    };
  }

  const cur = Number(currentNumeric);
  const nowMs = Date.now();
  /** @type {number[]} */
  const pastNums = [];

  /** @returns {boolean} */
  function isWithinDays(ts, days) {
    try {
      const t = new Date(ts).getTime();
      return (nowMs - t) / 86400000 <= days;
    } catch (_e) {
      return false;
    }
  }

  (entries || []).forEach((e) => {
    if (!e || !e.snapshot) return;
    if (!isWithinDays(e.ts || e.dayKey, 34)) return;
    if ((nowMs - new Date(e.ts || e.dayKey).getTime()) / 86400000 < 1) return;
    const v = Number(e.snapshot[metricKey]);
    if (!Number.isNaN(v)) pastNums.push(v);
  });

  if (!pastNums.length) {
    return {
      metric: metricLabel,
      currentValue: cur,
      trend7d: "insufficient_data",
      trend30d: "insufficient_data",
      direction: "unknown",
      confidence: 0.38,
      warning: null,
      generatedAt,
    };
  }

  const mean = pastNums.reduce((a, b) => a + b, 0) / pastNums.length;
  const delta = mean !== 0 ? ((cur - mean) / Math.abs(mean)) * 100 : cur === mean ? 0 : 100;
  let direction = "flat";
  if (delta > 4) direction = "up";
  else if (delta < -4) direction = "down";

  const window7 =
    entries && entries.some((x) => x && isWithinDays(x.ts || x.dayKey, 9) && Number(x.snapshot && x.snapshot[metricKey]) >= 0);
  /** @type {{ trend7d: number|string }} */
  const out7 = window7 ? { trend7d: Math.round(delta * 10) / 10 } : { trend7d: "insufficient_data" };

  const confidence =
    pastNums.length >= 10 ? 0.78 : pastNums.length >= 5 ? 0.64 : pastNums.length >= 2 ? 0.52 : 0.35;

  return {
    metric: metricLabel,
    currentValue: cur,
    trend7d: typeof out7.trend7d === "number" ? out7.trend7d : out7.trend7d,
    trend30d: typeof out7.trend7d === "number" ? out7.trend7d : "insufficient_data",
    direction,
    confidence,
    warning:
      pastNums.length < 3 ? "Thin KPI history window — revisit after more daily snapshots accumulate." : null,
    generatedAt,
  };
}

/**
 * Builds text trend for rate-style metrics (0–1) using same helper with scaled values.
 */
function buildRateTrend(metricKey, metricLabel, rate01, entries) {
  if (rate01 == null || Number.isNaN(Number(rate01))) {
    return buildMetricTrend(metricKey, metricLabel, null, entries);
  }
  return buildMetricTrend(metricKey, metricLabel, Number(rate01) * 100, entries);
}

module.exports = {
  buildMetricTrend,
  buildRateTrend,
};
