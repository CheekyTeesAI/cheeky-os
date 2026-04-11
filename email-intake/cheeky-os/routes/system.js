/**
 * Cheeky OS — Route: system.js
 * System monitoring endpoints: health, builds, activity, mobile summary.
 *
 * @module cheeky-os/routes/system
 */

const { Router } = require("express");
const { buffer, logger } = require("../utils/logger");
const { getCashSummary } = require("../engine/cash");
const { getProductionQueue } = require("../engine/production");
const { getPipeline, getHotLeads } = require("../engine/sales");
const { getHotDeals, getNextSalesActions } = require("../followup/engine");
const { fetchSafe } = require("../utils/fetchSafe");
const { getOpenFollowups, getAllFollowups } = require("../followup/tracker");
const { getMode } = require("../data/provider");
const { getBusinessSnapshot } = require("../data/sync");

const router = Router();

/** Server start timestamp for uptime calculation. */
const bootTime = new Date();

// ── GET /health — system health check ───────────────────────────────────────
router.get("/health", (req, res) => {
  const uptimeSec = Math.floor((Date.now() - bootTime.getTime()) / 1000);
  res.json({
    ok: true,
    data: {
      status: "healthy",
      service: "Cheeky OS v1",
      uptime: `${uptimeSec}s`,
      boot: bootTime.toISOString(),
      node: process.version,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
    },
    error: null,
  });
});

// ── GET /activity — recent log buffer ───────────────────────────────────────
router.get("/activity", (req, res) => {
  res.json({
    ok: true,
    data: {
      count: buffer.length,
      entries: [...buffer].reverse(),
    },
    error: null,
  });
});

// ── GET /mobile — mobile command center summary ─────────────────────────────
router.get("/mobile", async (req, res) => {
  logger.info("[SYSTEM] GET /mobile — building summary");

  const [cash, queue, pipeline, leads] = await Promise.all([
    getCashSummary(),
    getProductionQueue(),
    getPipeline(),
    getHotLeads(),
  ]);

  res.json({
    ok: true,
    data: {
      cash: cash.data,
      queue: queue.data,
      pipeline: pipeline.data,
      hot_leads: leads.data,
      followup_hot: { count: getHotDeals().length, records: getHotDeals() },
      followup_next: { count: getNextSalesActions().length, actions: getNextSalesActions() },
      paymentsOpen: { count: getOpenFollowups().length, records: getOpenFollowups() },
      paymentsPaid: (() => { const paid = getAllFollowups().filter((r) => r.status === "paid"); return { count: paid.length, records: paid }; })(),
      dataMode: getMode(),
      businessSnapshot: await getBusinessSnapshot().then((r) => r.data).catch(() => null),
      commands: "ready",
      generated_at: new Date().toISOString(),
    },
    error: null,
  });
});

// ── GET /builds — placeholder for build history ─────────────────────────────
router.get("/builds", (req, res) => {
  res.json({
    ok: true,
    data: {
      message: "Build history tracking — connect to GitHub Actions API for full history",
      last_check: new Date().toISOString(),
    },
    error: null,
  });
});

module.exports = router;
