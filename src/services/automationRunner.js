/**
 * Orchestrated automation cycle — isolated failures, respects rules + dry-run.
 */
const fs = require("fs");
const path = require("path");

const { DEFAULT_RULES } = require("../config/automationRules");
const { validateAutomationAction, recordAction } = require("./automationSafetyService");
const { appendAutomationLog } = require("./automationLogService");

const STATE_FILE = path.join(process.cwd(), "data", "automation-state.json");

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { paused: false, rules: {} };
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8") || "{}");
  } catch (_e) {
    return { paused: false, rules: {} };
  }
}

function saveState(partial) {
  try {
    const cur = loadState();
    const next = { ...cur, ...(partial && typeof partial === "object" ? partial : {}) };
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), "utf8");
    return next;
  } catch (_e) {
    return loadState();
  }
}

function getAutomationConfig() {
  const st = loadState();
  const envDry = String(process.env.AUTOMATION_DRY_RUN || "").toLowerCase() === "true";
  const rules = { ...DEFAULT_RULES, ...(st.rules && typeof st.rules === "object" ? st.rules : {}) };
  return {
    ...rules,
    dryRun: envDry || rules.dryRun === true,
    paused: !!st.paused,
  };
}

function setAutomationPaused(paused) {
  return saveState({ paused: !!paused });
}

function setAutomationRules(patch) {
  const st = loadState();
  const rules = { ...DEFAULT_RULES, ...(st.rules || {}), ...(patch && typeof patch === "object" ? patch : {}) };
  return saveState({ rules });
}

function isPaused() {
  return !!loadState().paused;
}

function buildEscalations({ jobs, bundle, errors }) {
  const out = [];
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (const j of jobs || []) {
      if (!j || !j.dueDate) continue;
      const fs = String(j.foundationStatus || "").toUpperCase();
      if (fs === "COMPLETE" || fs === "CANCELED") continue;
      const d = new Date(j.dueDate);
      if (Number.isFinite(d.getTime()) && d < start) {
        out.push({ type: "PAST_DUE", jobId: j.jobId, dueDate: j.dueDate });
      }
    }
  } catch (_e) {
    /* ignore */
  }
  try {
    const pb = bundle && bundle.paymentBlockedJobs;
    if (Array.isArray(pb) && pb.length) {
      out.push({ type: "PAYMENT_CONFLICT", count: pb.length });
    }
  } catch (_e) {
    /* ignore */
  }
  try {
    const ri = bundle && bundle.reconciliationIssues;
    if (Array.isArray(ri) && ri.length) {
      out.push({ type: "RECONCILIATION", count: ri.length });
    }
  } catch (_e) {
    /* ignore */
  }
  if (Array.isArray(errors) && errors.length >= 3) {
    out.push({ type: "CYCLE_ERRORS", count: errors.length });
  }
  return out.slice(0, 25);
}

/**
 * @param {{ only?: string[], label?: string }} [options]
 */
async function runAutomationCycle(options) {
  const opts = options && typeof options === "object" ? options : {};
  const only = Array.isArray(opts.only) && opts.only.length ? opts.only : null;
  const label = String(opts.label || "full");
  const skipGate = opts.skipGate === true;

  const cfg = getAutomationConfig();
  const dryRun = cfg.dryRun === true;
  const errors = [];
  const warnings = [];
  const actionsRun = [];

  const result = {
    intakeProcessed: 0,
    jobsAdvanced: 0,
    scheduleUpdated: false,
    purchasingPlan: null,
    communicationsQueued: 0,
    escalations: [],
    errors: [],
    mock: dryRun,
  };

  if (cfg.paused) {
    warnings.push("automation_paused");
    appendAutomationLog({
      actionsRun: [],
      successes: 0,
      failures: 0,
      warnings,
      mock: dryRun,
      detail: { skipped: "paused" },
    });
    return { ...result, errors: warnings };
  }

  const gate = skipGate
    ? { allowed: true, reason: "skip_gate" }
    : validateAutomationAction({
        type: "FULL_CYCLE",
        key: label,
        dryRun,
      });
  if (!skipGate && !gate.allowed && !dryRun) {
    warnings.push(gate.reason || "cycle_gated");
    appendAutomationLog({
      actionsRun: [label],
      successes: 0,
      failures: 0,
      warnings,
      mock: dryRun,
      detail: { gate },
    });
    return { ...result, errors: warnings };
  }

  const runStep = (name, fn) => {
    if (only && !only.includes(name)) return Promise.resolve(null);
    actionsRun.push(name);
    return fn();
  };

  let jobs = [];
  let bundle = {};

  try {
    await runStep("intake", async () => {
      if (!cfg.intakeProcessing) return;
      const intakeSvc = require("./intakeService");
      const dash = intakeSvc.getIntakeDashboardSnapshot();
      const n = (dash.intakeSummary && dash.intakeSummary.newTodayCount) || 0;
      result.intakeProcessed = n;
      if (dryRun) return;
    });
  } catch (e) {
    errors.push({ step: "intake", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("customerMatch", async () => {
      /* Matching runs inline on intake — automation only records health */
      if (dryRun) return;
    });
  } catch (e) {
    errors.push({ step: "customerMatch", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("jobs", async () => {
      if (!cfg.productionFlow && !cfg.scheduling && !cfg.purchasing) return;
      const { getOperatingSystemJobs } = require("./foundationJobMerge");
      const { getInvoices } = require("./squareDataService");
      const { normalizeInvoicesToJobs } = require("./jobNormalizer");
      const { upsertJobs } = require("../data/store");
      if (!dryRun) {
        try {
          const { invoices } = await getInvoices();
          const normalized = normalizeInvoicesToJobs(invoices);
          upsertJobs(normalized);
        } catch (e2) {
          warnings.push(`invoice_merge:${e2 && e2.message ? e2.message : "err"}`);
        }
      }
      jobs = await getOperatingSystemJobs().catch(() => require("../data/store").getJobs() || []);
    });
  } catch (e) {
    errors.push({ step: "jobs", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("production", async () => {
      if (!cfg.productionFlow) return;
      const { advanceJobs } = require("./productionFlowEngine");
      if (dryRun) {
        result.jobsAdvanced = 0;
        return;
      }
      await advanceJobs();
      result.jobsAdvanced = (jobs && jobs.length) || 0;
    });
  } catch (e) {
    errors.push({ step: "production", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("scheduling", async () => {
      if (!cfg.scheduling) return;
      const { buildWeeklyPlan } = require("./weekPlanner");
      if (!jobs.length) {
        try {
          const { getOperatingSystemJobs } = require("./foundationJobMerge");
          jobs = await getOperatingSystemJobs();
        } catch (_e) {
          jobs = [];
        }
      }
      if (dryRun) {
        result.scheduleUpdated = false;
        return;
      }
      await buildWeeklyPlan(jobs || []);
      result.scheduleUpdated = true;
    });
  } catch (e) {
    errors.push({ step: "scheduling", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("purchasing", async () => {
      if (!cfg.purchasing) return;
      const { buildPurchasePlan } = require("./purchasingPlanner");
      if (!jobs.length) {
        try {
          const { getOperatingSystemJobs } = require("./foundationJobMerge");
          jobs = await getOperatingSystemJobs();
        } catch (_e) {
          jobs = [];
        }
      }
      const plan = await buildPurchasePlan(jobs || []);
      result.purchasingPlan = dryRun ? { mock: true, shortages: (plan && plan.shortages && plan.shortages.length) || 0 } : plan;
    });
  } catch (e) {
    errors.push({ step: "purchasing", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("vendorPreview", async () => {
      if (!cfg.purchasing) return;
      const { previewPurchaseOrdersForSend } = require("./vendorOutboundEngine");
      if (dryRun) return;
      await previewPurchaseOrdersForSend().catch((e) => {
        warnings.push(`vendor_preview:${e && e.message ? e.message : "err"}`);
      });
    });
  } catch (e) {
    errors.push({ step: "vendorPreview", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("customerService", async () => {
      if (!cfg.customerService) return;
      const { runCustomerServiceAutomation } = require("./customerServiceAutomationEngine");
      if (dryRun) return;
      await runCustomerServiceAutomation();
    });
  } catch (e) {
    errors.push({ step: "customerService", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("communications", async () => {
      const { buildCommunicationRecommendations } = require("./communicationDecisionEngine");
      const { previewCommunication } = require("./communicationOrchestrator");
      const rec = await buildCommunicationRecommendations();
      const list = (rec && rec.recommendations) || [];
      result.communicationsQueued = list.length;
      if (dryRun || !cfg.communicationsAutoSafe) return;
      for (const r of list.slice(0, 2)) {
        const v = validateAutomationAction({ type: "COMM_QUEUE", key: r.recommendationId || r.templateKey, dryRun: false });
        if (!v.allowed) continue;
        try {
          await previewCommunication({
            templateKey: r.templateKey,
            relatedType: r.relatedType,
            relatedId: r.relatedId,
            channel: r.channel || "EMAIL",
          });
        } catch (_e) {
          /* optional */
        }
      }
    });
  } catch (e) {
    errors.push({ step: "communications", message: e && e.message ? e.message : String(e) });
  }

  try {
    await runStep("square", async () => {
      if (!cfg.squareSync) return;
      const { syncFromSquare } = require("./squareSyncEngine");
      if (dryRun) return;
      await syncFromSquare();
    });
  } catch (e) {
    errors.push({ step: "square", message: e && e.message ? e.message : String(e) });
  }

  try {
    const { getSquareDashboardBundle } = require("./squareSyncEngine");
    bundle = await getSquareDashboardBundle().catch(() => ({}));
    if (!jobs.length) {
      const { getOperatingSystemJobs } = require("./foundationJobMerge");
      jobs = await getOperatingSystemJobs().catch(() => []);
    }
    result.escalations = buildEscalations({ jobs, bundle, errors });
  } catch (_e) {
    /* ignore */
  }

  result.errors = errors.map((e) => e.message || JSON.stringify(e));

  if (!dryRun) {
    recordAction({ type: "FULL_CYCLE", key: label, dryRun: false });
  }

  const successes = actionsRun.length - errors.length;
  appendAutomationLog({
    actionsRun,
    successes: Math.max(0, successes),
    failures: errors.length,
    warnings,
    mock: dryRun,
    detail: {
      label,
      intakeProcessed: result.intakeProcessed,
      jobsAdvanced: result.jobsAdvanced,
      communicationsQueued: result.communicationsQueued,
    },
  });

  return result;
}

module.exports = {
  runAutomationCycle,
  getAutomationConfig,
  setAutomationPaused,
  setAutomationRules,
  isPaused,
  loadState,
};
