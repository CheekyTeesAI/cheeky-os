/**
 * Bundle 1 — revenue JSON routes (separate paths, read-only).
 */

const { Router } = require("express");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { getScriptSet } = require("../services/scriptTemplates");
const { getAutoFollowupsResponse } = require("../services/autoFollowupsService");

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

/** Bundle 5 — scored follow-ups (reuses getRevenueFollowups once per request). */
router.get("/auto-followups", async (_req, res) => {
  try {
    const data = await getAutoFollowupsResponse();
    return res.json(data);
  } catch (err) {
    console.error("[revenue] /auto-followups failed:", err.message || err);
    return res.json({ topActions: [] });
  }
});

/** Bundle 2 — static outreach templates (no AI, no outbound). */
router.get("/scripts", (_req, res) => {
  res.json(getScriptSet());
});

module.exports = router;
