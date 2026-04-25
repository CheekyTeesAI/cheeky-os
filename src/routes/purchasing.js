const express = require("express");
const router = express.Router();

const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { generatePurchaseList } = require("../services/purchasingEngine");
const { checkInventory } = require("../services/inventoryEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");
const { buildPurchasePlan } = require("../services/purchasingPlanner");
const { preparePOEmail } = require("../services/poDocumentService");
const { getOutboundDashboardSlice } = require("../services/vendorOutboundEngine");
const { getIntakeDashboardSnapshot } = require("../services/intakeService");
const { getSquareDashboardBundle } = require("../services/squareSyncEngine");

router.get("/list", async (req, res) => {
  try {
    const { invoices, mock, reason } = await getInvoices();
  upsertJobs(normalizeInvoicesToJobs(invoices));
  const jobs = await getOperatingSystemJobs();
    const purchaseList = generatePurchaseList(jobs);
    const inventory = checkInventory(purchaseList);
    const totalUnits = purchaseList.reduce((s, x) => s + Number(x.total || 0), 0);
    console.log("[purchasing/list] lines:", purchaseList.length, "units:", totalUnits, mock ? `MOCK(${reason || "no-token"})` : "LIVE");
    const payload = {
      success: true,
      count: purchaseList.length,
      totalUnits,
      purchaseList,
      inventory,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[purchasing/list] failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, count: 0, totalUnits: 0, purchaseList: [], inventory: { needed: [], available: [] }, mock: true, error: error && error.message ? error.message : "unknown_error" });
  }
});

router.get("/plan", async (_req, res) => {
  try {
    const jobs = await getOperatingSystemJobs();
    const plan = await buildPurchasePlan(jobs);
    let outboundSlice = {};
    try {
      outboundSlice = getOutboundDashboardSlice();
    } catch (_e) {
      outboundSlice = {};
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
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      requirements: plan.requirements,
      allocations: plan.allocations,
      shortages: plan.shortages,
      groupedPurchases: plan.groupedPurchases,
      purchaseOrders: plan.purchaseOrders,
      garmentBlockedJobs: plan.garmentBlockedJobs,
      scheduledJobIds: plan.scheduledJobIds,
      inventorySummary: plan.inventorySummary,
      assumptions: plan.assumptions,
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
    });
  } catch (e) {
    console.error("[purchasing/plan]", e && e.message ? e.message : e);
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/shortages", async (_req, res) => {
  try {
    const jobs = await getOperatingSystemJobs();
    const plan = await buildPurchasePlan(jobs);
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      shortages: plan.shortages,
      groupedPurchases: plan.groupedPurchases,
    });
  } catch (e) {
    return res.status(200).json({ success: false, shortages: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/po", async (_req, res) => {
  try {
    const jobs = await getOperatingSystemJobs();
    const plan = await buildPurchasePlan(jobs);
    const emails = (plan.purchaseOrders || []).map((po) => preparePOEmail(po));
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      purchaseOrders: plan.purchaseOrders,
      poEmailPreviews: emails,
    });
  } catch (e) {
    return res.status(200).json({ success: false, purchaseOrders: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/jobs-blocked", async (_req, res) => {
  try {
    const jobs = await getOperatingSystemJobs();
    const plan = await buildPurchasePlan(jobs);
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      garmentBlockedJobs: plan.garmentBlockedJobs,
    });
  } catch (e) {
    return res.status(200).json({ success: false, garmentBlockedJobs: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
