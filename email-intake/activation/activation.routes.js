"use strict";

/**
 * Activation Layer — Express Routes
 * Thin layer. Calls activation.runner → JSON.
 *
 * Mount at: app.use("/api/activation", require("./activation/activation.routes"))
 *
 * Endpoints:
 *   GET  /api/activation/health
 *   GET  /api/activation/today
 *   GET  /api/activation/jeremy
 *   POST /api/activation/task/:taskId/advance
 *   POST /api/activation/run         (manual engine trigger)
 *   GET  /api/activation/status
 */

const express = require("express");
const router = express.Router();
const runner = require("./activation.runner");

// ─── Health ───────────────────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  const status = runner.getRunnerStatus();
  return res.json({
    ok: true,
    service: "cheeky-os-activation",
    version: "1.0.0",
    mode: "auto",
    timestamp: new Date().toISOString(),
    runner: status,
  });
});

// ─── Status ───────────────────────────────────────────────────────────────────
router.get("/status", (_req, res) => {
  return res.json({ ok: true, ...runner.getRunnerStatus(), timestamp: new Date().toISOString() });
});

// ─── Today's priorities ───────────────────────────────────────────────────────
router.get("/today", async (req, res) => {
  try {
    const topN = req.query.top ? Math.min(Number(req.query.top), 20) : 5;
    const { topJobs, blockedJobs, allJobs } = await runner.getTodayPriorityJobs(topN);

    // Build recommendation string
    let recommendation = "No jobs ready for production right now.";
    if (topJobs.length > 0) {
      const top = topJobs[0];
      const label = top.orderNumber ? `Order #${top.orderNumber}` : top.orderId;
      const customerLabel = top.customerName ? ` (${top.customerName})` : "";
      const urgencyBadge = top.urgencyLabel === "OVERDUE" ? "⚠️ OVERDUE — " :
                           top.urgencyLabel === "RUSH" ? "🔥 RUSH — " :
                           top.urgencyLabel === "DUE_SOON" ? "⏰ Due soon — " : "";
      recommendation = `${urgencyBadge}Jeremy should start with ${label}${customerLabel} — ${top.method || "check method"}, qty ${top.quantity || "?"}.`;
    }

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      topJobs,
      blockedJobs,
      totalEligible: allJobs.length,
      totalBlocked: blockedJobs.length,
      recommendation,
    });
  } catch (err) {
    console.error("[activation/today]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Priority load failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─── Jeremy view ─────────────────────────────────────────────────────────────
router.get("/jeremy", async (_req, res) => {
  try {
    const view = await runner.getJeremyView();
    return res.json({ ok: true, ...view });
  } catch (err) {
    console.error("[activation/jeremy]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Jeremy view failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─── Advance task ─────────────────────────────────────────────────────────────
router.post("/task/:taskId/advance", async (req, res) => {
  try {
    const { taskId } = req.params;
    const body = req.body || {};
    const newStatus = String(body.status || "IN_PROGRESS").toUpperCase();
    const requestedBy = body.requestedBy || "operator";

    if (!taskId) return res.status(400).json({ ok: false, error: "taskId required" });

    const result = await runner.advanceTaskStatus(taskId, newStatus, requestedBy);
    return res.json(result);
  } catch (err) {
    console.error("[activation/task/advance]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Task advance failed.", detail: err && err.message ? err.message : String(err) });
  }
});

// ─── Manual engine trigger ────────────────────────────────────────────────────
router.post("/run", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await runner.runEngineOnce(body.requestedBy || "manual-trigger");
    return res.json({ ok: true, triggered: true, result });
  } catch (err) {
    console.error("[activation/run]", err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: "Engine trigger failed.", detail: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
