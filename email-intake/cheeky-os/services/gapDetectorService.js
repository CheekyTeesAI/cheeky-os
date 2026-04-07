/**
 * Bundle 44 — execution gaps + next best actions (recommendations only).
 */

const { getGoalsStatus } = require("./goalsService");
const { buildDepositPrioritiesPayload } = require("../routes/cash");

function nf(n) {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function sevFollowups(gap) {
  if (gap >= 5) return "critical";
  if (gap >= 3) return "high";
  if (gap >= 1) return "medium";
  return "low";
}

function sevInvoices(gap) {
  if (gap >= 3) return "critical";
  if (gap >= 2) return "high";
  if (gap >= 1) return "medium";
  return "low";
}

function sevProduction(gap) {
  if (gap >= 5) return "critical";
  if (gap >= 3) return "high";
  if (gap >= 1) return "medium";
  return "low";
}

function lc(s) {
  return String(s || "").toLowerCase();
}

/**
 * @returns {Promise<{ gaps: object[], topActions: object[] }>}
 */
async function getNextActionsPayload() {
  const gaps = [];
  /** @type {object[]} */
  const topCandidates = [];

  let goals = null;
  try {
    goals = await getGoalsStatus();
  } catch (_) {
    goals = { daily: {}, weekly: {}, kpiAvailable: false };
  }
  const daily = goals && goals.daily && typeof goals.daily === "object" ? goals.daily : {};

  function addGoalGap(type, rowKey, sevFn, recAction, maxSuggest) {
    const row = daily[rowKey];
    if (!row || typeof row !== "object") return;
    const target = nf(row.target);
    const actual = nf(row.actual);
    const gap = Math.max(0, target - actual);
    if (gap <= 0) return;
    const suggestedCount = Math.min(gap, maxSuggest);
    const severity = sevFn(gap);
    gaps.push({
      type,
      severity,
      current: actual,
      target,
      gap,
      recommendedAction: recAction,
      suggestedCount,
    });
  }

  addGoalGap(
    "followups",
    "followups",
    sevFollowups,
    "Follow up with top opportunities",
    5
  );
  addGoalGap(
    "invoices",
    "invoices",
    sevInvoices,
    "Create draft invoices for ready customers",
    3
  );
  addGoalGap(
    "production",
    "productionMoves",
    sevProduction,
    "Advance jobs in production queue",
    5
  );

  let depositOpps = [];
  try {
    const dep = await buildDepositPrioritiesPayload();
    depositOpps = Array.isArray(dep.opportunities) ? dep.opportunities : [];
  } catch (_) {
    depositOpps = [];
  }
  const depBlocking = depositOpps.filter((o) => {
    const p = lc(o && o.depositPriority);
    return p === "critical" || p === "high";
  });
  if (depBlocking.length > 0) {
    const suggestedCount = Math.min(depBlocking.length, 3);
    gaps.push({
      type: "deposits",
      severity: "critical",
      current: depBlocking.length,
      target: suggestedCount,
      gap: suggestedCount,
      recommendedAction: "Collect deposits from top blocked jobs",
      suggestedCount,
    });
  }

  const depositGap = gaps.find((g) => g.type === "deposits");
  if (depositGap && depositGap.suggestedCount > 0) {
    const n = depositGap.suggestedCount;
    topCandidates.push({
      action: n === 1 ? "Call 1 deposit customer" : `Call ${n} deposit customers`,
      reason: `${n} high-priority deposits blocking production`,
      priority: "critical",
    });
  }

  const invGap = gaps.find((g) => g.type === "invoices" && g.gap > 0);
  if (invGap && topCandidates.length < 3) {
    const n = invGap.suggestedCount;
    topCandidates.push({
      action: n === 1 ? "Create 1 draft invoice" : `Create ${n} draft invoices`,
      reason: "Invoice target not met",
      priority: String(invGap.severity || "medium"),
    });
  }

  const fuGap = gaps.find((g) => g.type === "followups" && g.gap > 0);
  if (fuGap && topCandidates.length < 3) {
    const n = fuGap.suggestedCount;
    topCandidates.push({
      action: n === 1 ? "Send 1 follow-up" : `Send ${n} follow-ups`,
      reason: "Behind daily follow-up target",
      priority: fuGap.severity,
    });
  }

  const prodGap = gaps.find((g) => g.type === "production" && g.gap > 0);
  if (prodGap && topCandidates.length < 3) {
    const n = prodGap.suggestedCount;
    topCandidates.push({
      action: n === 1 ? "Advance 1 production job" : `Advance ${n} production jobs`,
      reason: "Production moves behind daily target",
      priority: prodGap.severity,
    });
  }

  const topActions = topCandidates.slice(0, 3);

  return { gaps, topActions };
}

module.exports = {
  getNextActionsPayload,
};
