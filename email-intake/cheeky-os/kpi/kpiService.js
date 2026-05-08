"use strict";

/**
 * KPI engine — derives metrics from read-only Prisma orders, owner signals, approvals, and local files.
 * Never mutates external systems. Unknown → null + trend "insufficient_data".
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const draftHelpers = require("../drafting/draftOrderHelpers");
const approvalGateService = require("../approvals/approvalGateService");
const outreachDraftService = require("../growth/outreachDraftService");
const trends = require("./kpiTrendsService");

const HISTORY_FILE = "kpi-history.json";
const AD_INSIGHT_FILE = "google-ads-insights.json";

/** @deprecated read-only embedding for dashboards */
const PHASE4_AI_GUARDRAIL =
  "You are the Cheeky Tees operational + growth AI co-pilot. Protect cashflow and production first; " +
  "surface blockers early; improve Google Ads performance safely; never execute high-impact actions; " +
  "never mutate ad spend automatically; never send outreach automatically; generate drafts/recommendations only; " +
  "use metric-driven reasoning; if confidence is low, say so clearly.";

function historyPath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, HISTORY_FILE);
}

function insightsPath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, AD_INSIGHT_FILE);
}

function readHistoryDoc() {
  const p = historyPath();
  if (!fs.existsSync(p))
    return { entries: [], note: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!j || typeof j !== "object") return { entries: [] };
    const entries = Array.isArray(j.entries) ? j.entries : [];
    return { entries, note: j.note || null };
  } catch (_e) {
    return { entries: [], note: "recoverable_parse_error" };
  }
}

function writeHistoryDoc(doc) {
  const p = historyPath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function dayKeyNY() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${d}`;
  } catch (_e2) {
    return new Date().toISOString().slice(0, 10);
  }
}

function readGoogleAdsOpportunityCount() {
  try {
    const p = insightsPath();
    if (!fs.existsSync(p)) return 0;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const n =
      typeof j.warningCampaignCount === "number"
        ? j.warningCampaignCount
        : Array.isArray(j.campaigns)
          ? j.campaigns.filter((c) => c && (String(c.severity || "").toLowerCase() === "high" || c.wastedSpendCents > 0))
              .length
          : 0;
    return Number(n) || 0;
  } catch (_e) {
    return 0;
  }
}

async function computeSnapshot() {
  const generatedAt = new Date().toISOString();
  const dk = dayKeyNY();

  /** @type {object} */
  let owner = null;
  try {
    const { collectOwnerSignals } = require("../services/ownerSummary.service");
    owner = await collectOwnerSignals();
  } catch (_e) {
    owner = null;
  }

  const orders = await draftHelpers.loadOrdersForDrafts(800);
  const prismaReachable = Array.isArray(orders) && orders.length > 0;

  const nowMs = Date.now();
  const d30 = nowMs - 30 * 86400000;
  const d7 = nowMs - 7 * 86400000;

  let revenue30dUsd = 0;
  let revenue7dUsd = 0;
  let paidOrders30d = 0;
  let completed7d = 0;
  let quoteCandidates = 0;
  let quoteConverted = 0;
  let sumOrderTotals = 0;
  let orderRowsForAov = 0;
  let staleEstimates = 0;
  const emails = new Map();

  orders.forEach((o) => {
    if (!o) return;
    const em = String(o.email || "")
      .trim()
      .toLowerCase();
    if (em) emails.set(em, (emails.get(em) || 0) + 1);

    const paid = Number(o.amountPaid != null ? o.amountPaid : 0);
    const tot = Number(
      o.totalAmount != null ? o.totalAmount : o.total != null ? o.total : o.quotedAmount != null ? o.quotedAmount : 0
    );
    const fin = o.finalPaidAt ? new Date(o.finalPaidAt).getTime() : null;
    const comp = o.completedAt ? new Date(o.completedAt).getTime() : null;
    const touched = Math.max(fin || 0, comp || 0, o.updatedAt ? new Date(o.updatedAt).getTime() : 0);

    if (touched >= d30 && paid > 0) {
      revenue30dUsd += paid;
      paidOrders30d += 1;
    }
    if (touched >= d7 && paid > 0) revenue7dUsd += paid;
    if (comp && comp >= d7) completed7d += 1;

    if (tot > 50) {
      sumOrderTotals += tot;
      orderRowsForAov += 1;
    }

    const st = String(o.status || "").toUpperCase();
    const hadQuoteLane = !!(o.squareInvoiceSentAt || o.squareInvoiceId || /QUOTE|TENDER|EST|OPEN|INV/i.test(st));
    if (hadQuoteLane && !String(o.completedAt || "").trim()) {
      quoteCandidates += 1;
      try {
        if (o.quoteExpiresAt && new Date(o.quoteExpiresAt) < new Date() && !st.includes("COMPLET")) staleEstimates += 1;
      } catch (_e3) {}
    }
    if (hadQuoteLane && (o.depositPaid || paid > 0)) quoteConverted += 1;
  });

  let repeatCustomers = 0;
  emails.forEach((cnt) => {
    if (cnt >= 2) repeatCustomers += 1;
  });
  const distinctCustomers = emails.size || orders.length || 0;
  const repeatCustomerRate = distinctCustomers > 0 ? repeatCustomers / distinctCustomers : null;

  /** median approval dwell + resolved cadence */
  /** @type {number[]} */
  const dwellHours = [];
  /** @type {number} */
  let resolved7d = 0;
  try {
    const hist = approvalGateService.getApprovalHistory(400);
    const cut7 = Date.now() - 7 * 86400000;
    hist.forEach((h) => {
      if (!h || !h.createdAt) return;
      if (String(h.status) !== "approved" && String(h.status) !== "rejected") return;
      if (h.resolvedAt) {
        try {
          const dwell = (new Date(h.resolvedAt).getTime() - new Date(h.createdAt).getTime()) / 3600000;
          if (dwell >= 0 && dwell < 2400) dwellHours.push(dwell);
        } catch (_e4) {}
        if (new Date(h.resolvedAt).getTime() >= cut7) resolved7d += 1;
      }
    });
  } catch (_eH) {}

  const dwellSorted = dwellHours.slice().sort((a, b) => a - b);
  let medianApprovalResolveHours = null;
  if (dwellSorted.length) medianApprovalResolveHours = dwellSorted[Math.floor(dwellSorted.length / 2)];

  let pendingApprovals = 0;
  try {
    pendingApprovals = approvalGateService.getPendingApprovals().length;
  } catch (_eP) {
    pendingApprovals = 0;
  }

  let outreachDraftCount = 0;
  try {
    outreachDraftCount = outreachDraftService.listOutreachDrafts().length;
  } catch (_eO) {
    outreachDraftCount = 0;
  }

  let quoteConversionRate = null;
  if (quoteCandidates >= 12) quoteConversionRate = quoteConverted / quoteCandidates;
  else if (quoteCandidates >= 1 && quoteConverted >= 1) quoteConversionRate = quoteConverted / quoteCandidates;
  else quoteConversionRate = null;

  const averageOrderValueUsd =
    orderRowsForAov >= 5 ? sumOrderTotals / orderRowsForAov : prismaReachable ? null : null;

  const depositsTodayCount =
    owner && typeof owner.depositPaidToday === "number" ? owner.depositPaidToday : null;

  const outstandingApprox =
    owner && typeof owner.balanceDue === "number" ? Math.max(0, owner.balanceDue) : null;

  const snapshot = {
    dayKey: dk,
    generatedAt,
    prismaReachable,
    revenue30dUsd: paidOrders30d ? Math.round(revenue30dUsd * 100) / 100 : prismaReachable ? 0 : null,
    revenue7dUsd: Math.round(revenue7dUsd * 100) / 100,
    depositsTodayCount,
    outstandingBalanceUsdApprox: outstandingApprox != null ? Math.round(outstandingApprox * 100) / 100 : null,
    quoteConversionRate,
    averageOrderValueUsd: averageOrderValueUsd != null ? Math.round(averageOrderValueUsd * 100) / 100 : null,
    productionThroughput7d: completed7d,
    medianApprovalResolveHours30d: medianApprovalResolveHours,
    approvalsPending: pendingApprovals,
    approvalsResolved7d: resolved7d,
    outreachDraftCount,
    googleAdsOpportunityCount: readGoogleAdsOpportunityCount(),
    repeatCustomerRate: repeatCustomerRate != null ? Math.round(repeatCustomerRate * 1000) / 1000 : null,
    staleEstimateCount: staleEstimates,
    quoteCandidatesSampled: quoteCandidates,
    paidOrders30d,
    phase4GuardrailEcho: PHASE4_AI_GUARDRAIL,
  };

  if (!prismaReachable) {
    snapshot.dataNote = "insufficient_data";
  }

  return snapshot;
}

function upsertTodayEntry(snapshot) {
  const doc = readHistoryDoc();
  const entries = doc.entries.slice(-119);
  const idx = entries.findIndex((e) => e && e.dayKey === snapshot.dayKey);
  const row = { ts: snapshot.generatedAt, dayKey: snapshot.dayKey, snapshot };
  if (idx >= 0) entries[idx] = row;
  else entries.push(row);
  writeHistoryDoc({ entries, note: doc.note, lastWrittenAt: new Date().toISOString() });
  return entries;
}

async function buildKpiSummary() {
  const snapshot = await computeSnapshot();
  const entries = upsertTodayEntry(snapshot);

  const metricDefs = [
    ["revenue30dUsd", "Revenue (30d, paid)", snapshot.revenue30dUsd],
    ["depositsTodayCount", "Deposits recorded today", snapshot.depositsTodayCount],
    ["outstandingBalanceUsdApprox", "Outstanding balance (sampled)", snapshot.outstandingBalanceUsdApprox],
    ["productionThroughput7d", "Production completions (7d)", snapshot.productionThroughput7d],
    ["medianApprovalResolveHours30d", "Median approval resolution (hours)", snapshot.medianApprovalResolveHours30d],
    ["approvalsPending", "Approvals pending", snapshot.approvalsPending],
    ["approvalsResolved7d", "Approvals resolved (7d)", snapshot.approvalsResolved7d],
    ["outreachDraftCount", "Outreach drafts on disk", snapshot.outreachDraftCount],
    ["googleAdsOpportunityCount", "Google Ads flagged opportunities", snapshot.googleAdsOpportunityCount],
    ["staleEstimateCount", "Stale / overdue estimates (heuristic)", snapshot.staleEstimateCount],
    ["averageOrderValueUsd", "Average order value (tracked rows)", snapshot.averageOrderValueUsd],
    ["QUOTE_RATE", "__quote_conversion__", "__special__"],
    ["repeatCustomerRate", "Repeat customer rate", snapshot.repeatCustomerRate],
    ["QUOTE_FOLLOW", "__estimate_follow_perf__", "__special__"],
  ];

  /** @type {object[]} */
  const metrics = [];

  metricDefs.forEach(([key, label, raw]) => {
    if (key === "repeatCustomerRate") {
      if (raw == null || !snapshot.prismaReachable) {
        metrics.push({
          metric: label,
          currentValue: "insufficient_data",
          trend7d: "insufficient_data",
          trend30d: "insufficient_data",
          direction: "unknown",
          confidence: 0.28,
          warning: "Need more linked customer rows before repeat-rate is meaningful.",
          generatedAt: snapshot.generatedAt,
        });
      } else {
        metrics.push(trends.buildRateTrend("repeatCustomerRate", label, Number(raw), entries));
      }
      return;
    }
    if (key === "QUOTE_RATE") {
      const r = snapshot.quoteConversionRate;
      if (r == null || snapshot.quoteCandidatesSampled < 5) {
        metrics.push({
          metric: "Quote conversion (tracked)",
          currentValue: "insufficient_data",
          trend7d: "insufficient_data",
          trend30d: "insufficient_data",
          direction: "unknown",
          confidence: 0.25,
          warning: "Quote funnel sample still building — capture more invoiced lanes before trusting this KPI.",
          generatedAt: snapshot.generatedAt,
        });
      } else {
        metrics.push(trends.buildRateTrend("quoteConversionRate", "Quote conversion (tracked)", r, entries));
      }
      return;
    }
    if (key === "QUOTE_FOLLOW") {
      const stale = snapshot.staleEstimateCount;
      const cand = snapshot.quoteCandidatesSampled;
      if (!cand) {
        metrics.push({
          metric: "Estimate follow-up performance",
          currentValue: "insufficient_data",
          trend7d: "insufficient_data",
          trend30d: "insufficient_data",
          direction: "unknown",
          confidence: 0.24,
          warning: null,
          generatedAt: snapshot.generatedAt,
        });
      } else {
        const rate = cand ? stale / cand : null;
        metrics.push({
          metric: "Estimate follow-up performance (stale / open quotes sampled)",
          currentValue:
            cand >= 8
              ? Math.round(rate * 1000) / 1000
              : "insufficient_data",
          trend7d:
            cand >= 12 && typeof rate === "number"
              ? Math.round(rate * 10000) / 100
              : "insufficient_data",
          trend30d: "insufficient_data",
          direction: cand >= 8 && stale > cand * 0.35 ? "down" : "flat",
          confidence: cand >= 20 ? 0.74 : cand >= 8 ? 0.55 : 0.38,
          warning:
            stale > cand * 0.25
              ? "Several estimates look stale versus sampled open quotes — align follow-up drafts with approvals."
              : null,
          generatedAt: snapshot.generatedAt,
        });
      }
      return;
    }
    /** @type {number|null} */
    let numeric = typeof raw === "number" ? raw : null;
    if (numeric == null && raw !== 0 && key !== "revenue30dUsd") numeric = null;
    if (
      numeric == null &&
      (key === "revenue30dUsd" ||
        key === "productionThroughput7d" ||
        key === "medianApprovalResolveHours30d")
    )
      numeric = snapshot.prismaReachable === false ? null : numeric;

    if (key === "revenue30dUsd" && !snapshot.prismaReachable) {
      metrics.push({
        metric: label,
        currentValue: "insufficient_data",
        trend7d: "insufficient_data",
        trend30d: "insufficient_data",
        direction: "unknown",
        confidence: 0.3,
        warning: "Prisma/order snapshot unavailable — revenue KPI withheld.",
        generatedAt: snapshot.generatedAt,
      });
      return;
    }

    metrics.push(trends.buildMetricTrend(key, label, numeric !== null ? numeric : null, entries));
  });

  return {
    success: true,
    generatedAt: snapshot.generatedAt,
    snapshot,
    metrics,
    guardrailEcho: PHASE4_AI_GUARDRAIL,
    historyCoverageDays: entries.length,
  };
}

/**
 * Lightweight executive scores for embedding in morning brief (deterministic heuristic).
 */
function computeExecutiveMomentumScores(patch) {
  const p = patch && typeof patch === "object" ? patch : {};
  const criticalBlockers = Number(p.criticalBlockers || 0);
  const approvalsPending = Number(p.approvalsPending || 0);
  const frictionPulse = Number(p.frictionPulse || 0);
  const leadsSampled = Number(p.leadsSampled || 0);
  let operationalConfidenceScore = 0.56;
  operationalConfidenceScore -= Math.min(0.22, criticalBlockers * 0.035);
  operationalConfidenceScore -= Math.min(0.18, approvalsPending * 0.024);
  operationalConfidenceScore -= Math.min(0.12, Math.max(0, frictionPulse - 12) * 0.006);
  operationalConfidenceScore = Math.max(0.18, Math.min(0.94, operationalConfidenceScore));

  let growthMomentumScore = 0.46;
  growthMomentumScore += Math.min(0.3, leadsSampled * 0.004);
  growthMomentumScore += p.topLeadScore > 82 ? 0.08 : p.topLeadScore > 62 ? 0.04 : 0;
  growthMomentumScore = Math.max(0.12, Math.min(0.91, growthMomentumScore));

  let systemHealthScore = 0.68;
  if (p.squareReadOk === false) systemHealthScore -= 0.12;
  if (p.prismaReachable === false) systemHealthScore -= 0.18;
  if (p.diskWritable === false) systemHealthScore -= 0.1;
  systemHealthScore = Math.max(0.15, Math.min(0.95, systemHealthScore));

  return {
    operationalConfidenceScore: Math.round(operationalConfidenceScore * 1000) / 1000,
    growthMomentumScore: Math.round(growthMomentumScore * 1000) / 1000,
    systemHealthScore: Math.round(systemHealthScore * 1000) / 1000,
  };
}

module.exports = {
  buildKpiSummary,
  computeSnapshot,
  computeExecutiveMomentumScores,
  readHistoryEntries: () => readHistoryDoc().entries,
  PHASE4_AI_GUARDRAIL,
};
