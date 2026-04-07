/**
 * Bundle 2.5 — GET /sales/command-center (single JSON for outreach).
 */

const { Router } = require("express");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { buildNextAction } = require("../services/nextAction");
const { getScriptSet } = require("../services/scriptTemplates");
const {
  buildSalesLoop,
  runSalesAutomationCycle,
} = require("../services/salesLoopService");
const { runSalesOperatorCycle } = require("../services/salesOperatorService");

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

router.get("/loop", async (_req, res) => {
  try {
    const data = await buildSalesLoop();
    return res.json(data);
  } catch (err) {
    console.error("[sales/loop]", err.message || err);
    return res.json({
      candidates: [],
      summary: {
        messageReadyCount: 0,
        invoiceReadyCount: 0,
        highPriorityCount: 0,
      },
    });
  }
});

router.post("/run", async (_req, res) => {
  try {
    const out = await runSalesAutomationCycle();
    return res.json(out);
  } catch (err) {
    console.error("[sales/run]", err.message || err);
    return res.json({
      success: false,
      processed: 0,
      followupsSent: 0,
      draftInvoicesCreated: 0,
      skipped: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    });
  }
});

/** Bundle 31 — full follow-up → response interpret → next-step (no auto-invoice). */
router.post("/operator/run", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const responses = Array.isArray(body.responses) ? body.responses : undefined;
    const { cycleSummary, events } = await runSalesOperatorCycle(
      responses !== undefined ? { responses } : {}
    );
    return res.json({
      success: true,
      cycleSummary,
      events,
    });
  } catch (err) {
    console.error("[sales/operator/run]", err.message || err);
    return res.json({
      success: false,
      cycleSummary: {
        followupsSent: 0,
        responsesProcessed: 0,
        invoicesPrepared: 0,
        queuedActions: 0,
      },
      events: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
