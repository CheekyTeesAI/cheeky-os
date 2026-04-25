/**
 * Bundle 2.5 — GET /sales/command-center (single JSON for outreach).
 */

const { Router } = require("express");
const path = require("path");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { buildNextAction } = require("../services/nextAction");
const { getScriptSet } = require("../services/scriptTemplates");
const {
  buildSalesLoop,
  runSalesAutomationCycle,
} = require("../services/salesLoopService");
const { runSalesOperatorCycle } = require("../services/salesOperatorService");
const salesEngine = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "salesEngine.js"
));

const router = Router();
const TOP = 5;

router.get("/daily-call-list", async (req, res) => {
  try {
    const limit = Number(req.query && req.query.limit) || 5;
    const leads = await salesEngine.getDailyCallList(limit);
    return res.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (err) {
    console.error("[sales/daily-call-list]", err.message || err);
    return res.json({
      success: true,
      count: 0,
      leads: [],
    });
  }
});

router.get("/call-list", async (req, res) => {
  try {
    const limit = Number(req.query && req.query.limit) || 5;
    const leads = await salesEngine.getDailyCallList(limit);
    return res.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (err) {
    console.error("[sales/call-list]", err.message || err);
    return res.json({ success: true, count: 0, leads: [] });
  }
});

router.post("/log", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const customerId = String(body.customerId || "").trim();
    const outcome = String(body.outcome || "").trim();
    if (!customerId || !outcome) {
      return res.status(400).json({
        success: false,
        error: "customerId and outcome are required",
      });
    }
    const out = salesEngine.logSalesOutcome(customerId, outcome);
    return res.json({
      success: true,
      action: "sales_call_logged",
      result: out,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/ai-call-list", async (req, res) => {
  try {
    const limit = Number(req.query && req.query.limit) || 5;
    const out = await salesEngine.getAiCallList(limit);
    return res.json({
      success: true,
      count: out.leads.length,
      leads: out.leads,
      insights: out.insights,
    });
  } catch (err) {
    console.error("[sales/ai-call-list]", err.message || err);
    return res.json({
      success: true,
      count: 0,
      leads: [],
      insights: "",
    });
  }
});

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
