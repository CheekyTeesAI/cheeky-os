const express = require("express");
const router = express.Router();

const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { buildProductionQueue, buildFullProductionReport } = require("../services/productionEngine");
const { generatePurchaseList } = require("../services/purchasingEngine");
const { summarizeJobs } = require("../services/financeEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");
const { buildWeeklyPlan } = require("../services/weekPlanner");
const { buildPurchasePlan } = require("../services/purchasingPlanner");
const { getOutboundDashboardSlice } = require("../services/vendorOutboundEngine");
const { getIntakeDashboardSnapshot } = require("../services/intakeService");
const { getSquareDashboardBundle } = require("../services/squareSyncEngine");
const { buildDashboardCommunicationBundle } = require("./communications");
const { buildExecutiveSnapshot } = require("../services/executiveSnapshotService");
const { buildServiceDeskDashboardBundle } = require("../services/serviceDeskBundle");

function isDueTodayIso(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  const e = new Date();
  e.setHours(23, 59, 59, 999);
  return t >= s.getTime() && t <= e.getTime();
}

function isOverdueIso(iso, status) {
  const s = String(status || "").toUpperCase();
  if (s === "PAID" || s === "REFUNDED" || s === "CANCELED") return false;
  if (s === "OVERDUE") return true;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return t < start.getTime();
}

router.get("/", async (req, res) => {
  try {
    const { invoices, mock, reason } = await getInvoices();
    const normalized = normalizeInvoicesToJobs(invoices);
    upsertJobs(normalized);
    const jobs = await getOperatingSystemJobs();
    const dueToday = jobs.filter((j) => isDueTodayIso(j.dueDate)).length;
    const overdue = jobs.filter((j) => isOverdueIso(j.dueDate, j.status)).length;
    const production = buildFullProductionReport(jobs);
    const purchaseList = generatePurchaseList(jobs);
    const financials = summarizeJobs(jobs);

    let weeklyPlan = [];
    let todayPlan = null;
    let blockedJobs = [];
    let outsourcedJobs = [];
    let overflowJobs = [];
    let capacitySummary = null;
    let scheduleMock = false;
    let purchasePlan = null;
    let purchaseShortages = [];
    let purchaseOrders = [];
    let garmentBlockedJobs = [];
    let inventorySummary = null;
    let purchaseMock = false;
    try {
      const plan = await buildWeeklyPlan(jobs);
      weeklyPlan = plan.week || [];
      capacitySummary = plan.capacity || null;
      blockedJobs = plan.blocked || [];
      outsourcedJobs = plan.outsourced || [];
      overflowJobs = plan.overflow || [];
      scheduleMock = Boolean(plan.mock);
      const todayIso = new Date().toISOString().slice(0, 10);
      todayPlan = weeklyPlan.find((d) => d && d.date === todayIso) || null;
    } catch (e) {
      console.warn("[dashboard] week planner degraded:", e && e.message ? e.message : e);
    }

    let intakeSlice = {};
    try {
      intakeSlice = getIntakeDashboardSnapshot();
    } catch (_e) {
      intakeSlice = {};
    }

    let squareSlice = {};
    try {
      squareSlice = await getSquareDashboardBundle();
    } catch (_e) {
      squareSlice = {};
    }

    let commSlice = {};
    try {
      commSlice = await buildDashboardCommunicationBundle();
    } catch (e) {
      console.warn("[dashboard] communications bundle degraded:", e && e.message ? e.message : e);
      commSlice = {};
    }

    let executiveSlice = {};
    try {
      const snap = await buildExecutiveSnapshot();
      executiveSlice = {
        executiveSummary: snap.summary || "",
        topActions: (snap.actions || []).slice(0, 12),
        cashAlerts: {
          overdue: (snap.cashflow && snap.cashflow.overdueInvoices) || [],
          highPriority: (snap.cashflow && snap.cashflow.highPriorityCollections) || [],
          depositsNeeded: (snap.cashflow && snap.cashflow.depositsNeeded) || [],
        },
        riskAlerts: {
          critical: (snap.risks && snap.risks.criticalRisks) || [],
          upcoming: (snap.risks && snap.risks.upcomingRisks) || [],
          blocked: (snap.risks && snap.risks.blockedJobs) || [],
        },
        opportunityAlerts: {
          highValue: (snap.opportunities && snap.opportunities.highValueOpportunities) || [],
          quickWins: (snap.opportunities && snap.opportunities.quickWins) || [],
        },
        dailyFocus: snap.dailyFocus || null,
        executiveMock: Boolean(snap.mock),
      };
    } catch (e) {
      console.warn("[dashboard] executive snapshot degraded:", e && e.message ? e.message : e);
      executiveSlice = {};
    }

    let serviceDeskSlice = {};
    try {
      serviceDeskSlice = buildServiceDeskDashboardBundle();
    } catch (e) {
      console.warn("[dashboard] service desk bundle degraded:", e && e.message ? e.message : e);
      serviceDeskSlice = {};
    }

    let outboundSlice = {};
    try {
      const pp = await buildPurchasePlan(jobs);
      purchasePlan = pp;
      purchaseShortages = pp.shortages || [];
      purchaseOrders = pp.purchaseOrders || [];
      garmentBlockedJobs = pp.garmentBlockedJobs || [];
      inventorySummary = pp.inventorySummary || null;
      purchaseMock = Boolean(pp.mock);
      try {
        outboundSlice = getOutboundDashboardSlice();
      } catch (_e) {
        outboundSlice = {};
      }
    } catch (e) {
      console.warn("[dashboard] purchase plan degraded:", e && e.message ? e.message : e);
    }

    const payload = {
      success: true,
      totalJobs: jobs.length,
      dueToday,
      overdue,
      queue: production.queue,
      batches: production.batches,
      production: {
        ready: production.ready,
        blocked: production.blocked,
        batches: production.batches,
      },
      purchaseList,
      financials,
      weeklyPlan,
      todayPlan,
      blockedJobs,
      outsourcedJobs,
      overflowJobs,
      capacitySummary,
      purchasePlan,
      shortages: purchaseShortages,
      purchaseOrders,
      garmentBlockedJobs,
      inventorySummary,
      purchaseOrdersReady: outboundSlice.purchaseOrdersReady || [],
      pendingApprovals: outboundSlice.pendingApprovals || [],
      vendorOutboundStatus: outboundSlice.vendorOutboundStatus || [],
      directShipOrders: outboundSlice.directShipOrders || [],
      intakeSummary: intakeSlice.intakeSummary || null,
      recentInquiries: intakeSlice.recentInquiries || [],
      intakeReady: intakeSlice.intakeReady || [],
      intakeBlocked: intakeSlice.intakeBlocked || [],
      squareStatus: squareSlice.squareStatus || null,
      unpaidInvoices: squareSlice.unpaidInvoices || [],
      openEstimates: squareSlice.openEstimates || [],
      paymentBlockedJobs: squareSlice.paymentBlockedJobs || [],
      reconciliationIssues: squareSlice.reconciliationIssues || [],
      lastSquareSync: squareSlice.lastSquareSync || null,
      mock: Boolean(mock) || scheduleMock || purchaseMock,
      communicationSummary: commSlice.communicationSummary || null,
      communicationRecommendations: commSlice.communicationRecommendations || [],
      recentCommunications: commSlice.recentCommunications || [],
      failedCommunications: commSlice.failedCommunications || [],
      executiveSummary: executiveSlice.executiveSummary || null,
      topActions: executiveSlice.topActions || [],
      cashAlerts: executiveSlice.cashAlerts || null,
      riskAlerts: executiveSlice.riskAlerts || null,
      opportunityAlerts: executiveSlice.opportunityAlerts || null,
      dailyFocus: executiveSlice.dailyFocus || null,
      executiveMock: executiveSlice.executiveMock,
      serviceDeskSummary: serviceDeskSlice.serviceDeskSummary || null,
      ownerExceptions: serviceDeskSlice.ownerExceptions || [],
      teamServiceQueues: serviceDeskSlice.teamServiceQueues || {},
      recentAutoHandled: serviceDeskSlice.recentAutoHandled || [],
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[dashboard] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false,
      totalJobs: 0,
      dueToday: 0,
      overdue: 0,
      queue: [],
      mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

module.exports = router;
