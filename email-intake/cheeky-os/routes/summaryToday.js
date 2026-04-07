/**
 * Bundle 17 — GET /summary/today
 */

const { Router } = require("express");
const { getDailySummary } = require("../services/dailySummaryService");

const router = Router();

router.get("/today", async (_req, res) => {
  try {
    const data = await getDailySummary();
    return res.json({
      counts: data.counts || {},
      highlights: data.highlights || {},
    });
  } catch (err) {
    console.error("[summary/today]", err.message || err);
    return res.json({
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
});

module.exports = router;
