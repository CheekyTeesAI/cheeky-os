"use strict";

/**
 * Production Routing — Express Router
 * Thin route layer. Validates → service → JSON.
 * Mount at: app.use("/api/production", require("./productionRouting/routing.routes"))
 *
 * Endpoints:
 *   GET  /api/production/health
 *   GET  /api/production/queue
 *   POST /api/production/run
 *   POST /api/production/assign
 *   GET  /api/production/jobs
 *   GET  /api/production/tasks
 *   GET  /api/production/audit
 */

const express = require("express");
const router = express.Router();

const routingService = require("./routing.service");
const { determineProductionRoute, checkProductionEligibility } = require("./routing.rules");
const { readRoutingAudit } = require("./routing.audit");

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  return res.json({
    ok: true,
    service: "cheeky-os-production-routing",
    version: "1.0.0",
    mode: "safe",
    timestamp: new Date().toISOString(),
    capabilities: {
      routingEngine: true,
      jobCreation: true,
      taskGeneration: true,
      queueView: true,
      assignmentEngine: true,
      operatorBridgeCompatible: true,
    },
    rules: {
      depositRequired: true,
      noAutoSend: true,
      dtgDtfMin: 12,
      screenPrintMin: 24,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /queue
// ─────────────────────────────────────────────────────────────────────────────
router.get("/queue", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const result = await routingService.getProductionQueue({ limit });
    return res.json(result);
  } catch (err) {
    console.error("[production/queue]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Queue load failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /run
// ─────────────────────────────────────────────────────────────────────────────
router.post("/run", async (req, res) => {
  try {
    const body = req.body || {};
    const limit = body.limit || 50;
    const dryRun = body.dryRun === true;
    const requestedBy = body.requestedBy || "operator";

    if (limit < 1 || limit > 200) {
      return res.status(400).json({ ok: false, error: "limit must be 1–200." });
    }

    const result = await routingService.runProductionEngine({ limit, dryRun, requestedBy });
    return res.json(result);
  } catch (err) {
    console.error("[production/run]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Engine run failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assign
// ─────────────────────────────────────────────────────────────────────────────
router.post("/assign", async (req, res) => {
  try {
    const body = req.body || {};

    // Auto-assign all unassigned jobs
    if (body.autoAssign === true) {
      const result = await routingService.autoAssignJobs(body.requestedBy || "operator");
      return res.json(result);
    }

    // Assign specific job
    if (!body.jobId) {
      return res.status(400).json({ ok: false, error: "jobId required (or set autoAssign: true)." });
    }

    const result = await routingService.assignJob(body.jobId, body.assignee || null, body.requestedBy || "operator");
    return res.json(result);
  } catch (err) {
    console.error("[production/assign]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Assignment failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /jobs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/jobs", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await routingService.getProductionJobs({ limit });
    return res.json(result);
  } catch (err) {
    console.error("[production/jobs]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Jobs load failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tasks
// ─────────────────────────────────────────────────────────────────────────────
router.get("/tasks", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const tasks = await routingService.getOpenTasks(limit);
    return res.json({ ok: true, count: tasks.length, tasks });
  } catch (err) {
    console.error("[production/tasks]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Tasks load failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /audit
// ─────────────────────────────────────────────────────────────────────────────
router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const entries = await readRoutingAudit(limit);
    return res.json({ ok: true, count: entries.length, limit, entries });
  } catch (err) {
    console.error("[production/audit]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Audit read failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /route-preview — preview routing for a single order without creating job
// ─────────────────────────────────────────────────────────────────────────────
router.post("/route-preview", (req, res) => {
  try {
    const order = req.body || {};
    const eligibility = checkProductionEligibility(order);
    const route = determineProductionRoute(order);
    return res.json({
      ok: true,
      eligibility,
      route,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
