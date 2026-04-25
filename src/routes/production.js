const express = require("express");
const router = express.Router();

const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { buildFullProductionReport } = require("../services/productionEngine");
const { buildTodayPlan } = require("../services/dayPlanner");
const { planNext7Days } = require("../services/scheduler");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");

async function loadState() {
  const { invoices, mock, reason } = await getInvoices();
  upsertJobs(normalizeInvoicesToJobs(invoices));
  const jobs = await getOperatingSystemJobs();
  const production = buildFullProductionReport(jobs);
  return { jobs, production, mock, reason };
}

router.get("/queue", async (req, res) => {
  try {
    const { production, mock, reason } = await loadState();
    console.log(
      "[production/queue] ready:", production.ready.length,
      "blocked:", production.blocked.length,
      mock ? `MOCK(${reason || "no-token"})` : "LIVE",
    );
    const payload = {
      success: true,
      ready: production.ready,
      blocked: production.blocked,
      queue: production.queue,
      total: production.ready.length + production.blocked.length,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[production/queue] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false, ready: [], blocked: [], queue: [], total: 0, mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

router.get("/batches", async (req, res) => {
  try {
    const { production, mock, reason } = await loadState();
    const payload = {
      success: true,
      count: production.batches.length,
      batches: production.batches,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[production/batches] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false, count: 0, batches: [], mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const { production, mock, reason } = await loadState();
    const payload = {
      success: true,
      count: production.tasks.length,
      tasks: production.tasks,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[production/tasks] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false, count: 0, tasks: [], mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

router.get("/plan", async (req, res) => {
  try {
    const { production, mock, reason } = await loadState();
    const { plan } = buildTodayPlan(production.ready, production.batches);
    const payload = {
      success: true,
      plan,
      readyCount: production.ready.length,
      blockedCount: production.blocked.length,
      batchCount: production.batches.length,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[production/plan] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false, plan: [], mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

router.get("/schedule", async (req, res) => {
  try {
    const { jobs, mock, reason } = await loadState();
    const schedule = planNext7Days(jobs);
    const payload = {
      success: true,
      schedule,
      dailyCapacity: schedule.dailyCapacity,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[production/schedule] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false, schedule: { days: [] }, mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

module.exports = router;
