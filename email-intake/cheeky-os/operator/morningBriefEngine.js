"use strict";

/**
 * Executive morning brief — deterministic planning narrative (drafts/co-pilot style; no outbound calls).
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const PLANNING_PROMPT_FOOTER =
  "Executive planning lens: prioritize cashflow, blocked production, then growth. Separate Patrick approvals from Jeremy execution. Never bypass approvals.";

const CACHE_FILE = "morning-brief-cache.json";

function cachePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, CACHE_FILE);
}

function readCache() {
  try {
    const p = cachePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_e) {
    return null;
  }
}

function writeCache(doc) {
  try {
    const p = cachePath();
    const tmp = `${p}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch (_e) {}
}

/**
 * @returns {Promise<object>}
 */
async function buildMorningBrief() {
  const blockerFirstDashboardService = require("../dashboard/blockerFirstDashboardService");
  const approvalGateService = require("../approvals/approvalGateService");
  const productionBoardService = require("../production/productionBoardService");
  const frictionLogService = require("../ops/frictionLogService");
  const leadScoringService = require("../growth/leadScoringService");
  const shiftHandoffService = require("../ops/shiftHandoffService");
  const outreachDraftService = require("../growth/outreachDraftService");

  /** @type {object[]} */
  let phase2Approvals = [];
  try {
    phase2Approvals = approvalGateService.getPendingApprovals();
  } catch (_e) {
    phase2Approvals = [];
  }

  let envelope = { sections: [] };
  try {
    envelope = await blockerFirstDashboardService.buildBlockerFirstEnvelope();
  } catch (_e2) {
    envelope = {
      degraded: true,
      sections: [
        {
          title: "CRITICAL BLOCKERS",
          cards: [{ blockerReason: "Brief assembly used safe fallback.", whatToDoNext: "Reload after connectors stabilize." }],
        },
      ],
    };
  }

  let prodBoard = null;
  try {
    prodBoard = await productionBoardService.buildOperationalProductionBoard();
  } catch (_e3) {
    prodBoard = {
      columns: {},
      emptyExplanation: "Production snapshot unavailable safely.",
      orderCount: 0,
    };
  }

  const crit =
    envelope.sections &&
    envelope.sections[0] &&
    Array.isArray(envelope.sections[0].cards)
      ? envelope.sections[0].cards.slice(0, 5)
      : [];

  const cashCards =
    envelope.sections &&
    envelope.sections[1] &&
    envelope.sections[1].cards
      ? envelope.sections[1].cards.slice(0, 8)
      : [];

  /** overnight friction (~24h): last 40 lines filtered */
  let frictionPulse = [];
  try {
    const tail = frictionLogService.tailRecent(40);
    const since = Date.now() - 26 * 3600000;
    frictionPulse = tail.filter((row) => {
      try {
        return new Date(row.createdAt || 0).getTime() >= since;
      } catch (_x) {
        return false;
      }
    });
    if (!frictionPulse.length) frictionPulse = tail.slice(-5);
  } catch (_e4) {
    frictionPulse = [];
  }

  let leads = [];
  try {
    leads = leadScoringService.getTopLeads(80);
    if (!leads.length) leads = await leadScoringService.getTopLeadsFresh(80);
  } catch (_e5) {
    leads = [];
  }

  /** growth opportunities narrative */
  const growthOpportunities = leads.slice(0, 8).map((L) => ({
    label: `${L.customer}`,
    insight: `${L.category || "Growth"} • score ${L.score}`,
    suggestion: String(L.recommendedAction || "").slice(0, 220),
    leadId: L.leadId,
  }));

  const pendingOutreach = outreachDraftService.listOutreachDrafts().slice(0, 15);

  const shift = await shiftHandoffService.computeShiftSummary().catch(() => ({
    aiSummary: "Shift summary temporarily unavailable.",
  }));

  const cashWarnings = [];
  cashCards.forEach((c) => {
    if (/unpaid|opportunity|cash/i.test(String(c.blockerType || "") + String(c.blockerReason || "")))
      cashWarnings.push({
        line: `${c.customer || c.orderName || "Account"} — ${String(c.blockerReason || "").slice(0, 160)}`,
        next: String(c.whatToDoNext || "").slice(0, 140),
      });
  });

  /** Jeremy focus from production board */
  const jeremyFocus = [];
  const ready = prodBoard && prodBoard.columns ? prodBoard.columns["Production Ready"] || [] : [];
  const qc = prodBoard && prodBoard.columns ? prodBoard.columns["QC"] || [] : [];
  jeremyFocus.push(
    `${ready.length} card(s) in PRODUCTION_READY — Jeremy keeps presses fed after approvals.`,
    `${qc.length} job(s) in QC — tighten pass/fail notes before boxing.`
  );

  /** Top priorities (blockers beat growth - LAW 1) */
  const topPriorities = [];
  if (crit.filter((x) => x.blockerType && x.blockerType !== "none").length) {
    topPriorities.push(`Clear ${crit.length} surfaced critical lane item(s) before growing pipeline noise.`);
  } else {
    topPriorities.push("Operational lane looks controlled in this snapshot — still verify deposits + art proofs manually.");
  }
  if (cashWarnings.length) topPriorities.push("Cash visibility: reconcile unpaid / stale-estimate signals with deposit policy.");
  if (phase2Approvals.length) topPriorities.push(`${phase2Approvals.length} approval gate ticket(s) need Patrick signature before outbound action.`);
  const overdueLeads = leads.filter((x) => x.flags && x.flags.overdueEstimate);
  if (overdueLeads.length) topPriorities.push(`${overdueLeads.length} scored lead(s) carry overdue-estimate friction — prioritize friendly follow drafts.`);

  const patrickApprovals = phase2Approvals.slice(0, 14).map((a) => ({
    id: a.id,
    headline: `${a.customer || ""} — ${a.actionType}`,
    why: String(a.description || "").slice(0, 180),
    moneyImpact: a.moneyImpact,
  }));

  const outreachRecommendations = pendingOutreach.length
    ? pendingOutreach.map((d) => `${d.customer || "Lead"} • ${d.outreachType}`)
    : growthOpportunities.slice(0, 4).map((g) => `Draft ${g.label}: ${g.suggestion.slice(0, 120)}`);

  /** KPI snapshot */
  const kpiSnapshot = {
    pendingApprovals: phase2Approvals.length,
    productionReadyCount: ready.length,
    qcCount: qc.length,
    topLeadScore: leads.length ? leads[0].score : 0,
    growthLeadsScored: leads.length,
    frictionNotesWindow: frictionPulse.length,
    shiftApprovalsPending: typeof shift.approvalsPending === "number" ? shift.approvalsPending : phase2Approvals.length,
    unpaidInvoiceSignals: shift.cashOutstandingSignals && shift.cashOutstandingSignals.unpaidInvoiceSignals,
    squareConnector: shift.cashOutstandingSignals && shift.cashOutstandingSignals.squareStatus,
  };

  const operationalSummary =
    crit.filter((x) => x.blockerType && x.blockerType !== "none").length ||
    phase2Approvals.length ||
    cashWarnings.length
      ? "Ops attention still needed — growth work stays secondary until lane + cash checkpoints clear."
      : "Ops telemetry looks steady in this read-only snapshot — still log friction if dashboards mislead humans.";

  const playbookGenerator = require("../ops/playbookGenerator");
  const googleAdsInsightService = require("../growth/googleAdsInsightService");
  const kpiServiceThin = require("../kpi/kpiService");

  let thinSnapshot = null;
  try {
    thinSnapshot = await kpiServiceThin.computeSnapshot();
  } catch (_ks) {
    thinSnapshot = null;
  }

  const recurringFrictionDigest = playbookGenerator.detectFrictionHotspots(6);
  const recurringAdPerformanceDigest = playbookGenerator.recurringAdSignals(
    googleAdsInsightService.readInsightsSafe().campaigns || []
  );

  const sq =
    shift.cashOutstandingSignals && shift.cashOutstandingSignals.squareStatus
      ? shift.cashOutstandingSignals.squareStatus
      : "unknown";
  const phase4MomentumScores = kpiServiceThin.computeExecutiveMomentumScores({
    criticalBlockers: crit.filter((x) => x.blockerType && x.blockerType !== "none").length,
    approvalsPending: phase2Approvals.length,
    frictionPulse: frictionPulse.length,
    leadsSampled: leads.length,
    topLeadScore: leads.length ? leads[0].score : 0,
    squareReadOk: sq !== "error",
    prismaReachable: !!(thinSnapshot && thinSnapshot.prismaReachable),
    diskWritable: true,
  });

  const confidence =
    leads.length >= 12 && frictionPulse.length <= 35
      ? 0.74
      : leads.length >= 4
        ? 0.62
        : 0.52;

  const doc = {
    generatedAt: new Date().toISOString(),
    topPriorities,
    jeremyFocus,
    patrickApprovals,
    growthOpportunities,
    cashWarnings:
      cashWarnings.length > 0
        ? cashWarnings
        : [{ line: "No urgent cash anomalies in this blocker slice — refresh after Square snapshot updates.", next: "" }],
    outreachRecommendations,
    kpiSnapshot,
    operationalSummary,
    frictionOvernightNotes: frictionPulse.slice(0, 8).map((f) => ({
      area: f.area,
      description: String(f.description || "").slice(0, 160),
    })),
    shiftSummaryLine: shift.aiSummary || "",
    confidence,
    planningPromptEcho: PLANNING_PROMPT_FOOTER,
    recurringFrictionDigest,
    recurringAdPerformanceDigest,
    growthMomentumScore: phase4MomentumScores.growthMomentumScore,
    operationalConfidenceScore: phase4MomentumScores.operationalConfidenceScore,
    systemHealthScore: phase4MomentumScores.systemHealthScore,
    phase4MomentumScores,
    phase4GuardrailEcho: kpiServiceThin.PHASE4_AI_GUARDRAIL,
    topConcern:
      topPriorities[0] || "No critical blocker currently surfaced; keep verifying deposits/art gates manually.",
    changedSinceYesterday:
      frictionPulse.length > 0
        ? `${frictionPulse.length} friction note(s) in overnight window plus ${phase2Approvals.length} pending approval gate item(s).`
        : `${phase2Approvals.length} pending approval gate item(s); overnight friction signal is quiet.`,
    jeremyFinishToday:
      (jeremyFocus[0] || "Clear Ready for Jeremy cards and keep QC moving.") +
      " Keep execution lanes clean before growth tasks.",
    patrickReviewTonight:
      `Review approvals (${phase2Approvals.length}), cash warnings (${cashWarnings.length}), and ads signal before signing outbound decisions.`,
  };

  let systemHealthSummary = null;
  try {
    systemHealthSummary = await require("../monitoring/systemHealthService").buildSystemHealthSummary();
  } catch (_sh) {
    systemHealthSummary = null;
  }
  doc.systemHealth = systemHealthSummary;

  writeCache(doc);
  return doc;
}

function getCachedMorningBrief() {
  return readCache();
}

module.exports = {
  buildMorningBrief,
  getCachedMorningBrief,
  PLANNING_PROMPT_FOOTER,
};
