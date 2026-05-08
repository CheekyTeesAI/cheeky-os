"use strict";

/**
 * Nightly growth review package — deterministic assembly for Patrick (Gemini / planning sessions).
 * No schedulers: built on-demand via GET route.
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const kpiService = require("../kpi/kpiService");
const insightSvc = require("../growth/googleAdsInsightService");
const leadScoringService = require("../growth/leadScoringService");
const outreachDraftService = require("../growth/outreachDraftService");
const blockerFirstDashboardService = require("../dashboard/blockerFirstDashboardService");
const frictionLogService = require("../ops/frictionLogService");
const playbookGenerator = require("../ops/playbookGenerator");

const CACHE = "nightly-growth-review.json";

const STRATEGY_PROMPT =
  "You are the Cheeky Tees growth strategy AI. Priorities: protect cashflow, protect production, improve Google Ads efficiency, " +
  "increase qualified leads, increase quote conversion, identify growth opportunities. Rules: recommendations only; " +
  "no autonomous changes; metric-driven reasoning only; blockers first; concise and actionable.";

function cachePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, CACHE);
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
  } catch (_e2) {}
}

async function buildNightlyGrowthReview() {
  const generatedAt = new Date().toISOString();

  /** @type {object} */
  let env = { sections: [] };
  try {
    env = await blockerFirstDashboardService.buildBlockerFirstEnvelope();
  } catch (_e) {
    env = { sections: [], degraded: true };
  }

  const crit =
    env.sections && env.sections[0] && Array.isArray(env.sections[0].cards) ? env.sections[0].cards : [];

  const kpi = await kpiService.buildKpiSummary().catch(() => null);
  const ads = insightSvc.readInsightsSafe();

  let leads = [];
  try {
    leads = leadScoringService.getTopLeads(40);
    if (!leads.length) leads = await leadScoringService.getTopLeadsFresh(40);
  } catch (_e2) {
    leads = [];
  }

  const outreach = outreachDraftService.listOutreachDrafts().slice(0, 20);

  const friction = frictionLogService.tailRecent(60);
  const frictionDup = friction.reduce((m, row) => {
    const k = String(row.area || "general")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 40);
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

  const topRevenueOpportunities = leads.slice(0, 6).map((L) => ({
    label: L.customer,
    score: L.score,
    action: L.recommendedAction,
  }));

  const adCampaignWarnings = (ads.campaigns || [])
    .filter((c) => c && String(c.severity || "").toLowerCase() === "high")
    .slice(0, 8)
    .map((c) => `${c.name}: ${(c.issues && c.issues[0]) || "Review spend vs clicks"}`);

  const recommendedAdActions = (ads.campaigns || [])
    .filter((c) => c && ["medium", "high"].indexOf(String(c.severity || "").toLowerCase()) >= 0)
    .slice(0, 6)
    .map((c) => ({
      campaign: c.name,
      move: "Draft tighter RSA + negative keyword pass before bid changes (human executes in Google Ads).",
      guardrail: insightSvc.guardrailEcho(),
    }));

  const outreachRecommendations = outreach.length
    ? outreach.map((d) => `${d.customer} • ${d.outreachType}`)
    : topRevenueOpportunities.map((t) => `Draft follow-up for ${t.label}`);

  const quoteConversionInsights = [];
  if (kpi && kpi.snapshot) {
    if (kpi.snapshot.quoteConversionRate == null)
      quoteConversionInsights.push("Quote conversion rate withheld — widen tracked quote cohort before trusting.");
    else
      quoteConversionInsights.push(`Observed conversion proxy on sampled quotes ~ ${Math.round(kpi.snapshot.quoteConversionRate * 100)}% (${kpi.snapshot.quoteCandidatesSampled} sampled).`);
    if ((kpi.snapshot.staleEstimateCount || 0) > 4)
      quoteConversionInsights.push(`${kpi.snapshot.staleEstimateCount} stale estimate heuristic rows — approvals-first drafts.`);
  } else quoteConversionInsights.push("KPI engine unavailable tonight — hydrate /api/kpi/summary daytime.");

  const localMarketInsights = [];
  localMarketInsights.push(
    ads.rollup && ads.rollup.seasonalHint
      ? ads.rollup.seasonalHint
      : "Focus Greenville / Fountain Inn / Simpsonville proofs on landing pages."
  );

  /** recurring friction spotlight */
  Object.keys(frictionDup)
    .filter((k) => frictionDup[k] >= 4)
    .slice(0, 4)
    .forEach((k) =>
      quoteConversionInsights.push(`Repeated friction hotspot: "${k}" noted ${frictionDup[k]} times recently — playbook updated.`)
    );

  /** tomorrow focus driven by blocker law */
  const tomorrowFocus = [];
  if (crit.filter((x) => x.blockerType && x.blockerType !== "none").length)
    tomorrowFocus.push(`Unblock ${crit.length} surfaced critical items before layering ad experiments.`);
  if (kpi && kpi.snapshot && kpi.snapshot.approvalsPending)
    tomorrowFocus.push(`Patrick clears ${kpi.snapshot.approvalsPending} approval ticket(s) before any outbound customer touch.`);
  tomorrowFocus.push("Import fresh Google Ads rows for GEMINI review + run generate-drafts if campaigns look noisy.");
  tomorrowFocus.push("Scan KPI summary for quote follow-up deterioration — pair with outreach drafts only.");

  const growthMomentumScore =
    kpi && kpi.snapshot
      ? Math.min(
          0.92,
          0.35 + (leads.length ? Math.min(0.35, leads.length * 0.008) : 0) + (outreach.length ? 0.05 : 0)
        )
      : 0.32;

  const confidence =
    kpi && kpi.historyCoverageDays >= 5 && (ads.campaigns || []).length ? 0.76 : (ads.campaigns || []).length ? 0.62 : 0.48;

  const doc = {
    generatedAt,
    topRevenueOpportunities,
    adCampaignWarnings: adCampaignWarnings.length ? adCampaignWarnings : ["No high-severity campaigns flagged in import — still eye CPC manually."],
    recommendedAdActions,
    outreachRecommendations,
    quoteConversionInsights,
    localMarketInsights,
    tomorrowFocus,
    growthMomentumScore: Math.round(growthMomentumScore * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    blockerPatternNote:
      crit.length > 6
        ? "Blocker volume elevated — keep growth work secondary until envelope thins."
        : "Blocker envelope measured — still verify cash + art manually.",
    cashWarningsEcho:
      kpi && kpi.snapshot && typeof kpi.snapshot.outstandingBalanceUsdApprox === "number"
        ? `Outstanding balance signal (sampled) ~ $${kpi.snapshot.outstandingBalanceUsdApprox.toFixed(0)} — align with deposit policy.`
        : "Cash snapshot thin — pull owner summary manually if numbers feel off.",
    strategyPromptEcho: STRATEGY_PROMPT,
    guardrailEcho: insightSvc.guardrailEcho(),
    topConcern:
      crit[0] && (crit[0].blockerReason || crit[0].whatToDoNext)
        ? String(crit[0].blockerReason || crit[0].whatToDoNext).slice(0, 220)
        : "No critical blocker surfaced in current nightly read.",
    changedSinceYesterday:
      friction.length >= 1
        ? `${friction.length} recent friction note(s) captured; review repeated areas before tomorrow shift.`
        : "Friction feed quiet; changes mostly from KPI/ads snapshots.",
    jeremyFinishToday:
      crit.length
        ? "Finish top blocker clear path before opening new jobs in production queue."
        : "Keep production-ready and QC lanes clean first thing tomorrow.",
    patrickReviewTonight:
      `Review approvals + ad warnings + stale estimate insights before approving outbound drafts.`,
  };

  let systemHealthSummary = null;
  try {
    systemHealthSummary = await require("../monitoring/systemHealthService").buildSystemHealthSummary();
  } catch (_mh) {
    systemHealthSummary = null;
  }
  doc.systemHealth = systemHealthSummary;

  writeCache(doc);
  try {
    playbookGenerator.writeJeremyPlaybook({ nightly: doc, kpi, frictionTail: friction });
  } catch (_pg) {}

  return doc;
}

function getCachedNightlyReview() {
  return readCache();
}

module.exports = {
  buildNightlyGrowthReview,
  getCachedNightlyReview,
  STRATEGY_PROMPT,
};
