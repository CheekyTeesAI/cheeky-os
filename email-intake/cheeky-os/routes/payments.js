/**
 * Cheeky OS — Route: payments.js
 * Payment sync, status, webhook, open/paid listing endpoints.
 *
 * @module cheeky-os/routes/payments
 */

const { Router } = require("express");
const { syncAllTrackedPayments, syncInvoiceStatus, processPaymentEvent } = require("../payments/square-sync");
const { getOpenFollowups, getAllFollowups } = require("../followup/tracker");
const { testSquareAuth } = require("../integrations/square");
const { logger } = require("../utils/logger");

const router = Router();

// ── GET /payments/sync — sync all tracked payments against Square ────────────
router.get("/sync", async (req, res) => {
  try {
    logger.info("[PAYMENTS] GET /sync — syncing all tracked payments");
    const result = await syncAllTrackedPayments();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /payments/status/:invoiceId — check single invoice status ────────────
router.get("/status/:invoiceId", async (req, res) => {
  try {
    const { invoiceId } = req.params;
    logger.info(`[PAYMENTS] GET /status/${invoiceId}`);
    const result = await syncInvoiceStatus(invoiceId);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /payments/webhook — receive Square-style payment webhook ────────────
router.post("/webhook", async (req, res) => {
  try {
    logger.info("[PAYMENTS] POST /webhook — processing payment event");
    const body = req.body || {};

    if (!body || Object.keys(body).length === 0) {
      return res.json({ ok: false, data: null, error: "Empty webhook body" });
    }

    // Best-effort extraction from Square webhook payload
    const eventData = body.data?.object?.payment || body.data?.object?.invoice || body.data?.object || body;

    const payment = {
      invoiceId: eventData.invoice_id || eventData.invoiceId || body.invoice_id || null,
      customerEmail: eventData.buyer_email_address || eventData.customerEmail || eventData.customer_email || null,
      customerName: eventData.customer_name || eventData.customerName || null,
      amount: eventData.total_money?.amount
        ? eventData.total_money.amount / 100
        : eventData.amount || eventData.total || null,
      status: eventData.status || body.event_type || "paid",
    };

    const result = processPaymentEvent(payment);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /payments/open — list open (unpaid) followup records ─────────────────
router.get("/open", async (req, res) => {
  try {
    const open = getOpenFollowups();
    res.json({ ok: true, data: { count: open.length, records: open }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /payments/paid — list paid followup records ──────────────────────────
router.get("/paid", async (req, res) => {
  try {
    const all = getAllFollowups();
    const paid = all.filter((r) => r.status === "paid");
    res.json({ ok: true, data: { count: paid.length, records: paid }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /payments/test — verify Square auth by listing locations ────────────
router.get("/test", async (req, res) => {
  try {
    logger.info("[PAYMENTS] GET /test — verifying Square auth");
    const result = await testSquareAuth();
    return res.json(result);
  } catch (err) {
    return res.json({ ok: false, data: null, error: err.message });
  }
});

module.exports = router;
