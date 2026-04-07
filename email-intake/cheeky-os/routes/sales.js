/**
 * Bundle 2.5 — GET /sales/command-center (single JSON for outreach).
 */

const { Router } = require("express");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { buildNextAction } = require("../services/nextAction");
const { getScriptSet } = require("../services/scriptTemplates");

const router = Router();
const TOP = 5;

router.get("/command-center", async (_req, res) => {
  try {
    const [followups, buckets] = await Promise.all([
      getRevenueFollowups(),
      getReactivationBuckets(),
    ]);
    const next = buildNextAction(followups, buckets);
    const scripts = getScriptSet();

    res.json({
      nextAction: {
        action: next.action || "",
        type: next.type || "",
        reason: next.reason || "",
        target: {
          name: next.target && next.target.name ? next.target.name : "",
          phone: next.target && next.target.phone ? next.target.phone : "",
          email: next.target && next.target.email ? next.target.email : "",
          id: next.target && next.target.id ? next.target.id : "",
        },
      },
      staleEstimates: (followups.staleEstimates || []).slice(0, TOP),
      unpaidInvoices: (followups.unpaidInvoices || []).slice(0, TOP),
      hotReactivation: (buckets.hot || []).slice(0, TOP),
      scriptSet: scripts,
    });
  } catch (err) {
    console.error("[sales/command-center]", err.message || err);
    const scripts = getScriptSet();
    res.json({
      nextAction: {
        action: "No urgent sales actions — proceed to production",
        type: "production",
        reason: "Error loading data",
        target: { name: "", phone: "", email: "", id: "" },
      },
      staleEstimates: [],
      unpaidInvoices: [],
      hotReactivation: [],
      scriptSet: scripts,
    });
  }
});

module.exports = router;
