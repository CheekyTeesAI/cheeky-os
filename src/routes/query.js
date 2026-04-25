const express = require("express");
const router = express.Router();

const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { interpretQuery } = require("../services/queryEngine");
const { generateActions } = require("../services/actionEngine");
const { buildFullProductionReport } = require("../services/productionEngine");
const { buildTodayPlan } = require("../services/dayPlanner");
const { planNext7Days } = require("../services/scheduler");
const { generatePurchaseList } = require("../services/purchasingEngine");
const { checkInventory } = require("../services/inventoryEngine");
const { summarizeJobs } = require("../services/financeEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");

async function handleQuery(req, res) {
  const question = req.body && typeof req.body.question === "string" ? req.body.question : "";
  console.log("[query] QUERY RUN:", JSON.stringify({ question }));

  try {
    const { invoices, mock, reason } = await getInvoices();
    if (mock) console.log("[query] MOCK MODE ACTIVE", reason ? `(${reason})` : "");

    const normalized = normalizeInvoicesToJobs(invoices);
    upsertJobs(normalized);
    const jobs = await getOperatingSystemJobs();

    const result = interpretQuery(question, jobs);
    const actions = generateActions(jobs);
    const production = buildFullProductionReport(jobs);
    const { plan } = buildTodayPlan(production.ready, production.batches);
    const schedule = planNext7Days(jobs);
    const purchaseList = generatePurchaseList(jobs);
    const inventory = checkInventory(purchaseList);
    const financials = summarizeJobs(jobs);

    const payload = {
      success: true,
      question,
      intent: result.intent,
      answer: result.answer,
      count: Array.isArray(result.jobs) ? result.jobs.length : 0,
      jobs: Array.isArray(result.jobs) ? result.jobs : [],
      actions,
      queue: production.queue,
      production: {
        ready: production.ready,
        batches: production.batches,
        tasks: production.tasks,
        blocked: production.blocked,
      },
      routing: production.routing,
      vendors: production.vendors,
      purchasing: {
        list: purchaseList,
        inventory,
      },
      financials,
      plan,
      schedule,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[query] /query failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false,
      question,
      intent: "ERROR",
      answer: "Query engine error.",
      count: 0,
      jobs: [],
      actions: [],
      queue: [],
      production: { ready: [], batches: [], tasks: [], blocked: [] },
      routing: [],
      vendors: [],
      purchasing: { list: [], inventory: { needed: [], available: [] } },
      financials: { totalJobs: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, marginPercent: 0, perJob: [] },
      plan: [],
      schedule: { days: [] },
      mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
}

router.post("/query", handleQuery);
router.post("/", handleQuery);

module.exports = router;
