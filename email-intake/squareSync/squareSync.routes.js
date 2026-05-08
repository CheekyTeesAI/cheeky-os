"use strict";

/**
 * Square Sync — Express Router
 * Thin route layer. Validates → service → JSON.
 * Mount at: app.use("/api/square-sync", require("./squareSync/squareSync.routes"))
 *
 * Endpoints:
 *   GET  /api/square-sync/health
 *   GET  /api/square-sync/status
 *   POST /api/square-sync/manual
 *   POST /api/square-sync/reconcile
 *   GET  /api/square-sync/audit
 *   POST /api/square-sync/webhook-test  (safe test only)
 */

const express = require("express");
const router = express.Router();

const squareSyncService = require("./squareSync.service");
const { validateManualSyncInput, validateReconcileInput } = require("./squareSync.schemas");
const { readSyncAudit } = require("./squareSync.audit");

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

router.get("/health", (_req, res) => {
  const hasToken = Boolean((process.env.SQUARE_ACCESS_TOKEN || "").trim());
  const hasLocation = Boolean((process.env.SQUARE_LOCATION_ID || "").trim());
  const squareConfigured = hasToken && hasLocation;

  const response = {
    ok: true,
    service: "cheeky-os-square-sync",
    version: "1.0.0",
    mode: "safe",
    timestamp: new Date().toISOString(),
    capabilities: {
      manualSync: true,
      reconcile: true,
      webhookReady: true,
      auditLog: true,
      operatorBridgeCompatible: true,
    },
  };

  if (!squareConfigured) {
    response.squareWarning = "Square credentials not fully configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in .env for live sync.";
    response.squareConfigured = false;
  } else {
    response.squareConfigured = true;
  }

  return res.json(response);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /status
// ─────────────────────────────────────────────────────────────────────────────

router.get("/status", async (_req, res) => {
  try {
    const status = await squareSyncService.getSquareSyncStatus();
    return res.json(status);
  } catch (err) {
    console.error("[square-sync] /status error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Square sync status failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /manual
// ─────────────────────────────────────────────────────────────────────────────

router.post("/manual", async (req, res) => {
  try {
    const validation = validateManualSyncInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        errors: validation.errors,
        hint: "Provide: { amountTotal, amountPaid, currency?, orderId?, squareInvoiceId? }",
      });
    }

    const result = await squareSyncService.runManualSync(req.body);
    return res.json(result);
  } catch (err) {
    console.error("[square-sync] /manual error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Manual sync failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /reconcile
// ─────────────────────────────────────────────────────────────────────────────

router.post("/reconcile", async (req, res) => {
  try {
    const body = req.body || {};
    const validation = validateReconcileInput(body);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        errors: validation.errors,
        hint: "Provide: { limit?: number, dryRun?: boolean }",
      });
    }

    const result = await squareSyncService.reconcileOrders({
      limit: body.limit || 50,
      dryRun: body.dryRun !== false,
    });
    return res.json(result);
  } catch (err) {
    console.error("[square-sync] /reconcile error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Reconcile failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /audit
// ─────────────────────────────────────────────────────────────────────────────

router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const entries = await readSyncAudit(limit);
    return res.json({
      ok: true,
      count: entries.length,
      limit,
      entries,
    });
  } catch (err) {
    console.error("[square-sync] /audit error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Audit read failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook-test
// Safe test-only endpoint. Simulates a webhook event without live Square calls.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/webhook-test", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.type) {
      return res.status(400).json({
        ok: false,
        error: "type is required (e.g. invoice.payment_made, payment.created).",
      });
    }

    const result = await squareSyncService.handleSquareWebhookEvent(body);
    return res.json({ ok: true, mode: "webhook_test", ...result });
  } catch (err) {
    console.error("[square-sync] /webhook-test error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Webhook test failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
