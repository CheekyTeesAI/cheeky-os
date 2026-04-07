/**
 * Bundle 1 — revenue JSON routes (separate paths, read-only).
 */

const { Router } = require("express");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { getRevenueFollowups } = require("../services/revenueFollowups");

const router = Router();

router.get("/reactivation", async (_req, res) => {
  try {
    const data = await getReactivationBuckets();
    return res.json(data);
  } catch (err) {
    console.error("[revenue] /reactivation failed:", err.message || err);
    return res.json({ hot: [], warm: [], cold: [] });
  }
});

router.get("/followups", async (_req, res) => {
  try {
    const data = await getRevenueFollowups();
    return res.json(data);
  } catch (err) {
    console.error("[revenue] /followups failed:", err.message || err);
    return res.json({ unpaidInvoices: [], staleEstimates: [] });
  }
});

module.exports = router;
