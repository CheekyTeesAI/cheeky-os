/**
 * Cheeky OS — Route: followup2.js
 * Followup Engine 2.0 endpoints.
 *   POST /followup2/track      — create tracked record
 *   GET  /followup2/open       — all open followups
 *   GET  /followup2/stale      — stale deals
 *   GET  /followup2/hot        — hot deals
 *   POST /followup2/run        — run followup cycle
 *   GET  /followup2/next       — next sales actions
 *   POST /followup2/mark-paid  — mark a record as paid
 *
 * @module cheeky-os/routes/followup2
 */

const { Router } = require("express");
const {
  createTrackedInvoice,
  getStaleDeals,
  getHotDeals,
  runFollowupCycle,
  getNextSalesActions,
} = require("../followup/engine");
const { getOpenFollowups, markFollowupStatus } = require("../followup/tracker");
const { logger } = require("../utils/logger");
const { createSquareInvoice } = require("../integrations/square");

const router = Router();
console.log("[LIVE ROUTE FILE] followup2 loaded from:", __filename);
router.get("/", async (req, res) => {
  return res.json({
    ok: true,
    message: "followup2 root working"
  });
});

// ── POST /track — create a tracked followup record ─────────────────────────
async function handleTrack(req, res, payloadOverride = null) {
  try {
    const source = payloadOverride || req.body || {};
    const { customerName, customerEmail, invoiceId, total, deposit, notes } = source;
    const record = createTrackedInvoice({
      customerName,
      customerEmail,
      invoiceId,
      total: total || 0,
      deposit: deposit || 0,
      notes: notes || "",
    });
    logger.info(`[FOLLOWUP2] Tracked: ${customerName} — $${total}`);
    return res.json({ ok: true, data: record, error: null });
  } catch (err) {
    logger.error(`[FOLLOWUP2] /track error: ${err.message}`);
    return res.json({ ok: false, data: null, error: err.message });
  }
}
router.post("/track", async (req, res) => handleTrack(req, res));

// ── GET /open — all open followups ──────────────────────────────────────────
router.get("/open", async (req, res) => {
  try {
    const open = getOpenFollowups();
    res.json({ ok: true, data: { count: open.length, records: open }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /stale — stale deals ────────────────────────────────────────────────
router.get("/stale", async (req, res) => {
  try {
    const stale = getStaleDeals();
    res.json({ ok: true, data: { count: stale.length, records: stale }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /hot — hot deals ────────────────────────────────────────────────────
router.get("/hot", async (req, res) => {
  try {
    const hot = getHotDeals();
    res.json({ ok: true, data: { count: hot.length, records: hot }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /run — run followup cycle ──────────────────────────────────────────
async function handleRun(req, res) {
  try {
    logger.info("[FOLLOWUP2] Running followup cycle");
    const result = await runFollowupCycle();
if (result && result.created && result.created.length) {
  for (const order of result.created) {
    try {
      await createSquareInvoice({
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        title: order.title || order.product,
        quantity: order.quantity || 1,
        unitPrice: order.unitPrice || order.total,
        deposit: order.deposit || Math.round((order.total || 0) * 0.5 * 100),
      });
    } catch (err) {
      logger.error(`[SQUARE] Invoice failed: ${err.message}`);
    }
  }
}
    return res.json({ ok: true, data: result, error: null });
  } catch (err) {
    logger.error(`[FOLLOWUP2] /run error: ${err.message}`);
    return res.json({ ok: false, data: null, error: err.message });
  }
}
router.post("/run", async (req, res) => handleRun(req, res));

// ── GET /next — next sales actions ──────────────────────────────────────────
router.get("/next", async (req, res) => {
  try {
    const actions = getNextSalesActions();
    res.json({ ok: true, data: { count: actions.length, actions }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /mark-paid — mark a record as paid/closed ─────────────────────────
async function handleMark(req, res, idOverride = null) {
  try {
    const { id } = req.body || {};
    const targetId = idOverride || id;
    if (!targetId) {
      return res.json({ ok: false, data: null, error: "Missing id" });
    }
    const updated = markFollowupStatus(targetId, { status: "paid", stage: "closed" });
    if (!updated) {
      return res.json({ ok: false, data: null, error: `Record not found: ${targetId}` });
    }
    logger.info(`[FOLLOWUP2] Marked paid: ${targetId}`);
    return res.json({ ok: true, data: updated, error: null });
  } catch (err) {
    return res.json({ ok: false, data: null, error: err.message });
  }
}
router.post("/mark-paid", async (req, res) => handleMark(req, res));
router.post("/mark", async (req, res) => handleMark(req, res));

// Browser-safe aliases for manual testing
router.get("/test-run", async (req, res) => handleRun(req, res));
router.get("/test-track", async (req, res) =>
  handleTrack(req, res, {
    customerName: "Test Browser",
    customerEmail: "test@example.com",
    invoiceId: "test-" + Date.now(),
    total: 120,
    deposit: 60,
    notes: "GET /test-track",
  })
);
router.get("/test-mark", async (req, res) => {
  try {
    const open = getOpenFollowups();
    if (!open.length) {
      return res.json({ ok: false, data: null, error: "No open followup records to mark" });
    }
    return handleMark(req, res, open[0].id);
  } catch (err) {
    return res.json({ ok: false, data: null, error: err.message });
  }
});

router.get("/debug-run", async (req, res) => {
  try {
    const result = await require("../engine/followup").runFollowups();
    res.json({ ok: true, result });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
