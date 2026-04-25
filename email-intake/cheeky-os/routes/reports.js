/**
 * Square reporting endpoints (read-only).
 */

const express = require("express");
const path = require("path");

const router = express.Router();
const reports = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "squareReportingService.js"
));
const reportingCompat = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "reporting.js"
));

router.get("/run", async (req, res) => {
  try {
    const period = String((req.query && req.query.period) || "today")
      .trim()
      .toLowerCase();
    let data;
    let action;
    if (period === "week" || period === "weekly") {
      data = await reportingCompat.weeklySummary();
      action = "weekly_report_returned";
    } else {
      data = await reportingCompat.dailySummary();
      action = "daily_report_returned";
    }
    return res.json({
      success: true,
      action,
      result: data,
      spokenSummary:
        action === "weekly_report_returned"
          ? `This week: ${data.ordersThisWeek || 0} orders and $${Number(data.revenueThisWeek || 0).toFixed(2)} revenue.`
          : `Today: ${data.ordersCreatedToday || 0} orders and $${Number(data.revenueToday || 0).toFixed(2)} revenue.`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/customer", async (req, res) => {
  try {
    const email = String((req.query && req.query.email) || "").trim();
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "email query is required",
      });
    }
    const data = await reportingCompat.customerReport(email);
    return res.json({
      success: true,
      action: "customer_report_returned",
      result: data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/daily", async (_req, res) => {
  try {
    const data = await reports.getDailySales();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 },
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/weekly", async (_req, res) => {
  try {
    const data = await reports.getWeeklySales();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/customers", async (_req, res) => {
  try {
    const data = await reports.getTopCustomers();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/outstanding", async (_req, res) => {
  try {
    const data = await reports.getOutstandingInvoices();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: { unpaidInvoices: [], totalOutstandingAmount: 0 },
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/ai-summary", async (_req, res) => {
  try {
    const out = await reports.getAiSummary();
    return res.json({
      success: true,
      data: out.data,
      insights: out.insights,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: {},
      insights: "",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
