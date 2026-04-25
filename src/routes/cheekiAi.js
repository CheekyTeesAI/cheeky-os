const express = require("express");
const { saveAuditLog } = require("../services/storageService");
const { getSystemHealthReport } = require("../services/systemEngine");
const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { validateDataSource } = require("../services/dataIntegrityEngine");
const { buildFullProductionReport } = require("../services/productionEngine");
const { buildTodayPlan } = require("../services/dayPlanner");
const { planNext7Days } = require("../services/scheduler");
const { generatePurchaseList } = require("../services/purchasingEngine");
const { checkInventory } = require("../services/inventoryEngine");
const { summarizeJobs } = require("../services/financeEngine");
const { runSelfHeal } = require("../services/selfHealEngine");
const { getSystemStatus } = require("../services/statusEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");

const router = express.Router();
router.use(express.json());

function safeRequire(paths) {
  for (const p of paths) {
    try {
      return { ok: true, module: require(p), path: p };
    } catch (_error) {
      // Continue trying candidate modules.
    }
  }
  return { ok: false, module: null, path: null };
}

function getMissingEnvKeys() {
  const keys = [
    "OPENAI_API_KEY",
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_LOCATION_ID",
    "RESEND_API_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
  ];
  return keys.filter((k) => !String(process.env[k] || "").trim());
}

function listRegisteredRoutes(app) {
  const found = [];
  try {
    const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : [];
    for (const layer of stack) {
      if (layer.route && layer.route.path && layer.route.methods) {
        const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
        for (const method of methods) {
          found.push(`${method} ${layer.route.path}`);
        }
      }
    }
  } catch (error) {
    console.warn("[cheekiAi] route inspection failed:", error && error.message ? error.message : error);
  }
  return found;
}

function detectBrokenRoutes(app) {
  const mustHave = ["POST /cheeky-ai/run", "POST /collections/run", "POST /webhooks/email-intake"];
  const present = new Set(listRegisteredRoutes(app));
  return mustHave.filter((r) => !present.has(r));
}

function mockSalesSignals() {
  return [
    {
      id: "lead_amber_hvac",
      source: "salesEngine:mock",
      customer: "Amber HVAC Services",
      summary: "Quote requested 4 days ago for 120 shirts; no response sent.",
      value: 1850,
      urgency: 4,
    },
    {
      id: "lead_river_youth",
      source: "salesEngine:mock",
      customer: "River Youth Baseball",
      summary: "Returning customer requested rush hoodies.",
      value: 2400,
      urgency: 3,
    },
  ];
}

function mockCollectionsSignals() {
  return [
    {
      id: "col_invoice_1922",
      source: "collectionsService:mock",
      customer: "Pine Creek Church",
      summary: "Invoice #1922 overdue by 16 days.",
      value: 980,
      urgency: 16,
      amount_owed: 980,
      days_overdue: 16,
    },
    {
      id: "col_invoice_2077",
      source: "collectionsService:mock",
      customer: "Metro Realty Group",
      summary: "Invoice #2077 overdue by 9 days.",
      value: 640,
      urgency: 9,
      amount_owed: 640,
      days_overdue: 9,
    },
  ];
}

async function runSalesEngine(payload) {
  const loaded = safeRequire([
    "../services/salesEngine.js",
    "../../email-intake/src/services/salesEngine.js",
  ]);
  if (!loaded.ok) {
    console.warn("[cheekiAi] salesEngine missing, using mock");
    return { success: true, mocked: true, opportunities: mockSalesSignals() };
  }

  try {
    const mod = loaded.module;
    if (typeof mod.getDailyCallList === "function") {
      const leads = await mod.getDailyCallList(payload.limit || 5);
      const opportunities = (Array.isArray(leads) ? leads : []).map((lead, idx) => ({
        id: lead.customerId || `sales_${idx + 1}`,
        source: "salesEngine:live",
        customer: lead.name || "Unknown Customer",
        summary: lead.reason || "Sales opportunity",
        value: Number(lead.totalSpend) || 350,
        urgency: Math.max(1, Number(lead.score) || 1),
      }));
      return { success: true, mocked: false, opportunities };
    }
  } catch (error) {
    console.warn("[cheekiAi] salesEngine live call failed, using mock:", error && error.message ? error.message : error);
  }
  return { success: true, mocked: true, opportunities: mockSalesSignals() };
}

async function runCollectionsService(payload) {
  const loaded = safeRequire(["../services/collectionsService.js"]);
  if (!loaded.ok) {
    console.warn("[cheekiAi] collectionsService missing, using mock");
    return { success: true, mocked: true, opportunities: mockCollectionsSignals() };
  }
  try {
    const mod = loaded.module;
    if (typeof mod.runCollections === "function") {
      const result = await mod.runCollections(payload);
      const opportunities = Array.isArray(result && result.items)
        ? result.items.map((item, idx) => ({
            id: item.id || `collections_${idx + 1}`,
            source: "collectionsService:live",
            customer: item.customer || "Unknown Customer",
            summary: item.message || "Collections follow-up",
            value: Number(item.amount_owed) || 0,
            urgency: Number(item.days_overdue) || 1,
            amount_owed: Number(item.amount_owed) || 0,
            days_overdue: Number(item.days_overdue) || 0,
          }))
        : [];
      return { success: true, mocked: false, opportunities };
    }
  } catch (error) {
    console.warn("[cheekiAi] collectionsService live call failed, using mock:", error && error.message ? error.message : error);
  }
  return { success: true, mocked: true, opportunities: mockCollectionsSignals() };
}

function runActionEngine(signals) {
  const loaded = safeRequire(["../services/actionEngine.js"]);
  if (!loaded.ok || typeof loaded.module.scoreAndRank !== "function") {
    console.warn("[cheekiAi] actionEngine missing, using local fallback");
    const queue = (Array.isArray(signals) ? signals : [])
      .map((s) => {
        const value = Number(s.value || s.amount_owed || 0);
        const urgency = Number(s.urgency || s.days_overdue || 1);
        const score = Math.round((value / 100) * Math.max(1, urgency));
        return { ...s, score };
      })
      .sort((a, b) => b.score - a.score);
    return { success: true, total: queue.length, queue };
  }
  return loaded.module.scoreAndRank(signals);
}

async function buildOperationsSnapshot() {
  const snapshot = {
    systemStatus: null,
    dataSources: { square: { mock: true, reason: null }, storage: { mock: true, reason: null } },
    jobs: [],
    queue: [],
    batches: [],
    tasks: [],
    routing: [],
    vendors: [],
    purchasing: { list: [], inventory: { needed: [], available: [] } },
    financials: { totalJobs: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, marginPercent: 0, perJob: [] },
    plan: [],
    schedule: { days: [] },
    gaps: [],
    selfHeal: [],
    dataIntegrity: { invoices: null, jobs: null },
    mock: true,
    note: "Using placeholder data",
  };

  try {
    const status = getSystemStatus();
    snapshot.systemStatus = status;

    const invoicesResult = await getInvoices();
    const mock = Boolean(invoicesResult.mock);
    snapshot.mock = mock;
    snapshot.note = mock ? "Using placeholder data" : "Using live data";
    snapshot.dataSources.square = {
      mock,
      reason: invoicesResult.reason || null,
      source: mock ? "mock" : "square_live",
    };

    const invoiceValidation = validateDataSource({ invoices: invoicesResult.invoices, mock, kind: "invoices" });
    snapshot.dataIntegrity.invoices = {
      total: invoiceValidation.total,
      excluded: invoiceValidation.excluded,
      issues: invoiceValidation.issues,
      mock: invoiceValidation.mock,
    };

    const normalized = normalizeInvoicesToJobs(invoiceValidation.validData);
    upsertJobs(normalized);
    const jobs = await getOperatingSystemJobs();

    const jobValidation = validateDataSource({ jobs, mock, kind: "jobs" });
    snapshot.dataIntegrity.jobs = {
      total: jobValidation.total,
      excluded: jobValidation.excluded,
      issues: jobValidation.issues,
      mock: jobValidation.mock,
    };

    snapshot.jobs = jobValidation.validData;

    const production = buildFullProductionReport(jobValidation.validData);
    snapshot.queue = production.queue;
    snapshot.batches = production.batches;
    snapshot.tasks = production.tasks;
    snapshot.routing = production.routing;
    snapshot.vendors = production.vendors;
    snapshot.production = {
      ready: production.ready,
      blocked: production.blocked,
      batches: production.batches,
      tasks: production.tasks,
    };

    const { plan } = buildTodayPlan(production.ready, production.batches);
    snapshot.plan = plan;
    snapshot.schedule = planNext7Days(jobValidation.validData);

    const purchaseList = generatePurchaseList(jobValidation.validData);
    snapshot.purchasing = { list: purchaseList, inventory: checkInventory(purchaseList) };
    snapshot.financials = summarizeJobs(jobValidation.validData);

    const gaps = [];
    if (Array.isArray(status.missingKeys)) gaps.push(...status.missingKeys.map((k) => ({ key: k, category: "env" })));
    if (production.blocked && production.blocked.length > 0) {
      gaps.push({ key: "JOB_BLOCKERS", category: "data", detail: `${production.blocked.length} job(s) blocked — missing art/info/quantity/garment.` });
    }
    if (invoiceValidation.excluded > 0) {
      gaps.push({ key: "INVOICE_VALIDATION", category: "data", detail: `${invoiceValidation.excluded} invoice(s) excluded as invalid.` });
    }
    if (jobValidation.excluded > 0) {
      gaps.push({ key: "JOB_VALIDATION", category: "data", detail: `${jobValidation.excluded} job(s) excluded as invalid.` });
    }
    snapshot.gaps = gaps;
    snapshot.selfHeal = runSelfHeal(gaps.map((g) => g.key));

    return snapshot;
  } catch (error) {
    console.error("[cheekiAi] snapshot failed:", error && error.message ? error.message : error);
    snapshot.gaps = [{ key: "SNAPSHOT_ERROR", detail: error && error.message ? error.message : "unknown" }];
    return snapshot;
  }
}

router.post("/run", async (req, res) => {
  try {
    console.log("[cheekiAi] SYSTEM RUN triggered");
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const sales = await runSalesEngine(payload);
    const collections = await runCollectionsService(payload);
    const allSignals = []
      .concat(Array.isArray(sales.opportunities) ? sales.opportunities : [])
      .concat(Array.isArray(collections.opportunities) ? collections.opportunities : []);
    const ranked = runActionEngine(allSignals);
    const missingEnvKeys = getMissingEnvKeys();
    const brokenRoutes = detectBrokenRoutes(req.app);

    const systemHealth = getSystemHealthReport(req.app);
    const snapshot = await buildOperationsSnapshot();

    console.log(
      "[cheekiAi] DATA SOURCE:",
      snapshot.dataSources.square.source,
      "MOCK:", snapshot.mock,
      "GAPS:", snapshot.gaps.length,
    );

    const responsePayload = {
      success: true,
      engine: "cheeky-ai",
      route: "/cheeky-ai/run",
      mock: snapshot.mock,
      note: snapshot.note,
      systemStatus: snapshot.systemStatus,
      dataSources: snapshot.dataSources,
      jobs: snapshot.jobs,
      queue: snapshot.queue,
      batches: snapshot.batches,
      tasks: snapshot.tasks,
      routing: snapshot.routing,
      vendors: snapshot.vendors,
      purchasing: snapshot.purchasing,
      financials: snapshot.financials,
      plan: snapshot.plan,
      schedule: snapshot.schedule,
      gaps: snapshot.gaps,
      selfHeal: snapshot.selfHeal,
      dataIntegrity: snapshot.dataIntegrity,
      production: snapshot.production,
      actionQueue: ranked.queue || [],
      actionQueueCount: ranked.total || 0,
      queue_count: ranked.total || 0,
      diagnostics: {
        missing_env_keys: missingEnvKeys,
        broken_routes: brokenRoutes,
        modules: {
          sales_mocked: sales.mocked === true,
          collections_mocked: collections.mocked === true,
          action_engine_mocked: ranked.success !== true,
        },
        system_health: systemHealth,
      },
      timestamp: new Date().toISOString(),
    };

    Promise.resolve(
      saveAuditLog({
        event: "cheeky_ai_run",
        queue_count: responsePayload.queue_count,
        mock: responsePayload.mock,
        data_source: snapshot.dataSources.square.source,
        gaps: snapshot.gaps.map((g) => g.key),
        diagnostics: responsePayload.diagnostics,
      })
    ).catch((error) => {
      console.warn("[cheekiAi] audit write failed:", error && error.message ? error.message : error);
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("[cheekiAi] /run failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false,
      error: error && error.message ? error.message : "cheeky-ai run failed",
      mock: true,
      note: "Using placeholder data (orchestrator failure)",
      systemStatus: { health: "CRITICAL" },
      dataSources: { square: { mock: true, reason: "orchestrator_error" } },
      jobs: [],
      queue: [],
      batches: [],
      tasks: [],
      routing: [],
      vendors: [],
      purchasing: { list: [], inventory: { needed: [], available: [] } },
      financials: { totalJobs: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, marginPercent: 0, perJob: [] },
      plan: [],
      schedule: { days: [] },
      gaps: [{ key: "ORCHESTRATOR_ERROR", detail: error && error.message ? error.message : "unknown" }],
      selfHeal: [],
      actionQueue: [],
      actionQueueCount: 0,
      queue_count: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

/** Exposed for POST /command unified pipeline (same snapshot core as /run). */
router.buildOperationsSnapshot = buildOperationsSnapshot;

module.exports = router;
