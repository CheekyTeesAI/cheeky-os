"use strict";

const express = require("express");
const router = express.Router();

const { getFinancialSummary } = require("../services/financeService");
const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { summarizeJobs } = require("../services/financeEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");

router.get("/api/finance", async (_req, res) => {
  try {
    const data = await getFinancialSummary();
    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "finance_summary_failed",
    });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const { invoices, mock, reason } = await getInvoices();
    upsertJobs(normalizeInvoicesToJobs(invoices));
    const jobs = await getOperatingSystemJobs();
    const summary = summarizeJobs(jobs);
    console.log("[finance/summary] revenue:", summary.totalRevenue, "profit:", summary.totalProfit, mock ? `MOCK(${reason || "no-token"})` : "LIVE");
    const payload = {
      success: true,
      ...summary,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[finance/summary] failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, totalJobs: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, marginPercent: 0, perJob: [], mock: true, error: error && error.message ? error.message : "unknown_error" });
  }
});

module.exports = router;
