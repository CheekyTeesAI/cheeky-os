"use strict";

/**
 * Exception summaries for reporting route — composites read-only cockpit signals (no paging human comms).
 */

const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("../ops/frictionLogService");
const blockerFirstDashboardService = require("../dashboard/blockerFirstDashboardService");
const kpiService = require("../kpi/kpiService");
const insightSvc = require("../growth/googleAdsInsightService");
const productionBoardService = require("../production/productionBoardService");
const playbookGenerator = require("../ops/playbookGenerator");

async function buildExceptionReport() {
  const generatedAt = new Date().toISOString();
  /** @type {object[]} */
  const exceptions = [];

  /** recurring blockers approximation */
  let env = { sections: [] };
  try {
    env = await blockerFirstDashboardService.buildBlockerFirstEnvelope();
  } catch (_e) {
    env = { sections: [] };
  }

  const crit =
    env.sections && env.sections[0] && Array.isArray(env.sections[0].cards)
      ? env.sections[0].cards.slice(0, 24)
      : [];
  playbookGenerator.blockerFingerprintCounts(crit).forEach((b) =>
    exceptions.push({
      category: "recurring_blocker_pattern",
      severity: "medium",
      headline: `Repeated blocker pattern (${b.count} cards)`,
      detail: `${b.fingerprint.slice(0, 180)}`,
    })
  );

  /** stale approvals */
  try {
    const pend = approvalGateService.getPendingApprovals();
    pend.forEach((a) => {
      const ageHr =
        (Date.now() - new Date(a.createdAt || Date.now()).getTime()) / 3600000;
      if (ageHr > 48)
        exceptions.push({
          category: "stale_approval",
          severity: "high",
          headline: "Approval aging > 48h",
          detail: `${a.actionType} · ${String(a.customer || "").slice(0, 140)} (${Math.round(ageHr)}h)`,
        });
    });
    if (!pend.length)
      exceptions.push({
        category: "stale_approval",
        severity: "low",
        headline: "No pending cockpit approvals right now",
        detail: "If this mismatches gut feel, regenerate approvals list manually.",
      });
  } catch (_eP) {}

  /** cash-at-risk shorthand */
  const snapTry = await kpiService.computeSnapshot().catch(() => null);
  if (snapTry && typeof snapTry.outstandingBalanceUsdApprox === "number" && snapTry.outstandingBalanceUsdApprox > 7500)
    exceptions.push({
      category: "cash_at_risk",
      severity: "medium",
      headline: "Outstanding balance signal elevated (sampled)",
      detail: `≈ $${snapTry.outstandingBalanceUsdApprox.toFixed(0)} outstanding — reconcile with Square truth.`,
    });

  /** quote conversion deterioration */
  if (snapTry && snapTry.quoteConversionRate != null && snapTry.quoteCandidatesSampled >= 14 && snapTry.quoteConversionRate < 0.22)
    exceptions.push({
      category: "quote_conversion_decline",
      severity: "medium",
      headline: "Quote conversion looks soft versus sampled denominator",
      detail: `${Math.round(snapTry.quoteConversionRate * 100)}% conversion on ${snapTry.quoteCandidatesSampled} sampled rows — human QA funnel.`,
    });

  /** wasted ad spend heuristics */
  const ads = insightSvc.readInsightsSafe();
  (ads.campaigns || [])
    .filter((c) => c && (c.wastedSpendCents || 0) > 0)
    .slice(0, 6)
    .forEach((c) =>
      exceptions.push({
        category: "wasted_ad_spend_heuristic",
        severity: "medium",
        headline: `Potential wasted spend signal: ${c.name}`,
        detail: "Heuristic from low engagement + scale — confirm in Google Ads UI before pausing.",
      })
    );

  /** production slowdown */
  let board = null;
  try {
    board = await productionBoardService.buildOperationalProductionBoard();
  } catch (_eB) {
    board = null;
  }
  const cols = board && board.columns ? board.columns : {};
  const hold = (cols["On Hold"] && cols["On Hold"].length) || 0;
  if (hold >= 4)
    exceptions.push({
      category: "production_slowdown",
      severity: "medium",
      headline: "Multiple jobs sitting On Hold",
      detail: `${hold} card(s) — align with Patrick on deposit/art/vendor reality.`,
    });

  /** friction recurrence */
  playbookGenerator.detectFrictionHotspots(8).forEach((f) => {
    if (f.severity === "high")
      exceptions.push({
        category: "repeated_friction",
        severity: "medium",
        headline: `Repeated friction: ${f.area}`,
        detail: `${f.count} recent notes — see jeremy-playbook.md for compiled context.`,
      });
  });

  /** system health */
  let diskOk = true;
  try {
    const fs = require("fs");
    const path = require("path");
    const taskQueue = require("../agent/taskQueue");
    fs.accessSync(path.join(taskQueue.DATA_DIR, "friction-log.json"), fs.constants.R_OK);
  } catch (_eD) {
    diskOk = false;
  }
  if (!diskOk)
    exceptions.push({
      category: "system_health",
      severity: "high",
      headline: "Local data readability issue",
      detail: "Could not confirm friction-log readability — diagnose disk permissions calmly.",
    });

  exceptions.push({
    category: "trust_note",
    severity: "low",
    headline: "Trust > automation checkpoint",
    detail: `${insightSvc.guardrailEcho().slice(0, 260)}`,
  });

  return { generatedAt, exceptions: exceptions.slice(0, 60), guardrailEcho: insightSvc.guardrailEcho() };
}

module.exports = {
  buildExceptionReport,
};
