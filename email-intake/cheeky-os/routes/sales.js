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
const {
  buildSalesPipelinePayload,
  getFollowups,
  buildDailySalesToday,
} = require("../services/salesEngineV1.service");
const { generateSalesMessage } = require("../services/salesMessageDraft.service");
const { buildBigDealsPayload, REVENUE_ACCELERATION_META } = require("../services/revenueAccelerationEngine.service");
const salesOpportunityEngine = require("../services/salesOpportunityEngine.service");

const router = Router();
const TOP = 5;

const SALES_ENGINE_V1_META = {
  pipelineVisible: true,
  followupsGenerated: true,
  messagesDrafted: true,
  salesActionsRanked: true,
  noAutoSend: true,
};

const REVENUE_ACCEL_WRAP = { revenueAcceleration: true, noAutoSend: true };

router.get("/opportunities", async (_req, res) => {
  try {
    const out = await salesOpportunityEngine.getOpportunitiesList();
    return res.json({ ...out, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      opportunities: [],
      metrics: { open: 0, drafted: 0, highPriority: 0, estimatedPipeline: 0 },
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/brief", async (_req, res) => {
  try {
    const out = await salesOpportunityEngine.buildSalesBrief();
    return res.json(out);
  } catch (err) {
    return res.status(200).json({
      ok: true,
      headline: "Sales brief error",
      todayFocus: [],
      topOpportunities: [],
      draftsWaiting: [],
      pipelineEstimate: 0,
      recommendedActions: [],
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/scan", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const autoDraft =
      body.autoDraft === true ||
      String(process.env.CHEEKY_SALES_AUTO_DRAFT || "")
        .trim()
        .toLowerCase() === "true";
    const out = await salesOpportunityEngine.runSalesOpportunityScan({
      autoDraft,
      enrichSquare: body.enrichSquare !== false,
      limitBuckets: body.limitBuckets,
      orderLimit: body.orderLimit,
    });
    if (!out.ok) {
      return res.status(503).json({ ok: false, ...out });
    }
    return res.json({ ok: true, ...out });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/opportunities/:id/draft", async (req, res) => {
  try {
    const out = await salesOpportunityEngine.createSalesFollowupDraft(req.params.id);
    return res.status(out.ok ? 200 : 400).json({ ...out, ...SALES_ENGINE_V1_META });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ...SALES_ENGINE_V1_META,
    });
  }
});

router.patch("/opportunities/:id/status", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await salesOpportunityEngine.patchOpportunityStatus(
      req.params.id,
      body.status,
      body.note
    );
    return res.status(out.ok ? 200 : 400).json(out);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/big-deals", async (_req, res) => {
  try {
    const body = await buildBigDealsPayload();
    return res.json({ ...body, ...REVENUE_ACCEL_WRAP });
  } catch (err) {
    console.error("[sales/big-deals]", err.message || err);
    return res.status(200).json({
      totalOpportunities: 0,
      topDeals: [],
      potentialRevenue: 0,
      actionsRequired: [],
      error: err instanceof Error ? err.message : String(err),
      ...REVENUE_ACCELERATION_META,
      ...REVENUE_ACCEL_WRAP,
    });
  }
});

router.get("/pipeline", async (_req, res) => {
  try {
    const body = await buildSalesPipelinePayload();
    return res.json({ ...body, ...SALES_ENGINE_V1_META });
  } catch (err) {
    console.error("[sales/pipeline]", err.message || err);
    return res.status(200).json({
      quotes: { new: [], awaitingResponse: [], followupNeeded: [], highValue: [] },
      customers: { repeatCustomers: [], highValueCustomers: [], dormantCustomers: [] },
      opportunities: { quickWins: [], bulkOpportunities: [], rushOpportunities: [] },
      error: err instanceof Error ? err.message : String(err),
      ...SALES_ENGINE_V1_META,
    });
  }
});

router.get("/followups", async (_req, res) => {
  try {
    const { followups } = await getFollowups();
    return res.json({ followups, ...SALES_ENGINE_V1_META });
  } catch (err) {
    console.error("[sales/followups]", err.message || err);
    return res.status(200).json({ followups: [], error: err instanceof Error ? err.message : String(err), ...SALES_ENGINE_V1_META });
  }
});

router.get("/today", async (_req, res) => {
  try {
    const body = await buildDailySalesToday();
    return res.json({ ...body, ...SALES_ENGINE_V1_META });
  } catch (err) {
    console.error("[sales/today]", err.message || err);
    return res.status(200).json({
      revenueTarget: 0,
      pipelineValue: 0,
      likelyToClose: 0,
      followupsRequired: 0,
      topActions: [],
      error: err instanceof Error ? err.message : String(err),
      ...SALES_ENGINE_V1_META,
    });
  }
});

router.post("/message-draft", async (req, res) => {
  try {
    const out = await generateSalesMessage(req.body && typeof req.body === "object" ? req.body : {});
    return res.status(out.ok ? 200 : 400).json({ ...out, ...SALES_ENGINE_V1_META });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      draftOnly: true,
      error: err instanceof Error ? err.message : String(err),
      ...SALES_ENGINE_V1_META,
    });
  }
});

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
