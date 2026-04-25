/**
 * Bundle 17 — GET /summary/today
 */

const { Router } = require("express");
const { getDailySummary } = require("../services/dailySummaryService");

const router = Router();

async function handleDailySummary(_req, res) {
  try {
    const data = await getDailySummary();
    return res.json({
      success: true,
      counts: data.counts || {},
      highlights: data.highlights || {},
    });
  } catch (err) {
    console.error("[summary/today]", err.message || err);
    return res.json({
      success: true,
      counts: {
        urgentFollowups: 0,
        blockedOrders: 0,
        readyToPrint: 0,
        inProduction: 0,
        highRiskOrders: 0,
      },
      highlights: {
        topAction: "",
        topCustomer: "",
        biggestOpportunity: "",
      },
    });
  }
}

router.get("/today", handleDailySummary);
router.get("/daily-summary", handleDailySummary);

module.exports = router;
