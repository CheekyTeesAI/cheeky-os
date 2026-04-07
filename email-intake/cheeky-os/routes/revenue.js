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

/** Bundle 2 — static outreach templates (no AI, no outbound). */
router.get("/scripts", (_req, res) => {
  res.json({
    reactivation:
      "Hey [Name] — this is Patrick from Cheeky Tees. We’re running a production window this week and wanted to see if you need anything printed.",
    followup_invoice:
      "Hey [Name], just checking in on your invoice — we can get this moving as soon as you're ready.",
    followup_estimate:
      "Hey [Name], wanted to see if you'd like to move forward with your order.",
    new_lead:
      "Hey! We can definitely help you with that — want me to put together a quick mockup and quote?",
  });
});

module.exports = router;
