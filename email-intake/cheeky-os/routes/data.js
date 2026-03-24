/**
 * Cheeky OS — Route: data.js
 * Data layer endpoints: mode, snapshot, deals, events, customers, payments.
 *
 * @module cheeky-os/routes/data
 */

const { Router } = require("express");
const { store, getMode } = require("../data/provider");
const { getBusinessSnapshot } = require("../data/sync");
const dataverseStore = require("../data/dataverse-store");
const { logger } = require("../utils/logger");

const router = Router();
router.get("/", (req, res) => {
  res.json({ ok: true, message: "data route working" });
});

// ── GET /data/mode — current data mode ──────────────────────────────────────
router.get("/mode", async (req, res) => {
  try {
    res.json({ ok: true, data: { mode: getMode() }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /data/snapshot — business snapshot ──────────────────────────────────
router.get("/snapshot", async (req, res) => {
  try {
    logger.info("[DATA] GET /snapshot");
    const result = await getBusinessSnapshot();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /data/deals/open — open deals ───────────────────────────────────────
router.get("/deals/open", async (req, res) => {
  try {
    if (getMode() === "dataverse") {
      const auth = await dataverseStore.ensureAuth();
      if (!auth.ok) {
        return res.json({ ok: false, data: null, error: auth.error });
      }
    }

    const timeoutMs = 5000;
    const deals = await Promise.race([
      store.getOpenDeals(),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: false, data: null, error: `Dataverse deals query timed out after ${timeoutMs}ms` }),
          timeoutMs
        )
      ),
    ]);
    if (deals && deals.ok === false) {
      return res.json({ ok: false, data: null, error: deals.error || "Unable to load open deals" });
    }
    const records = Array.isArray(deals) ? deals : deals?.data || [];
    res.json({ ok: true, data: { count: records.length, records }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /data/events — recent events ────────────────────────────────────────
router.get("/events", async (req, res) => {
  try {
    const events = await store.getEvents();
    const records = Array.isArray(events) ? events : events?.data || [];
    const recent = records.slice(-50).reverse();
    res.json({ ok: true, data: { count: recent.length, records: recent }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /data/customer — save a customer ───────────────────────────────────
router.post("/customer", async (req, res) => {
  try {
    const { name, email, phone, company } = req.body || {};
    if (!name && !email) {
      return res.json({ ok: false, data: null, error: "name or email required" });
    }
    logger.info(`[DATA] POST /customer — ${name || email}`);
    const saved = await store.saveCustomer({ name, email, phone, company });
    res.json({ ok: true, data: saved, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /data/deal — save a deal ───────────────────────────────────────────
router.post("/deal", async (req, res) => {
  try {
    const deal = req.body || {};
    logger.info(`[DATA] POST /deal — ${deal.customerName || "(unknown)"}`);
    const saved = await store.saveDeal(deal);
    res.json({ ok: true, data: saved, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /data/payment — save a payment ─────────────────────────────────────
router.post("/payment", async (req, res) => {
  try {
    const payment = req.body || {};
    logger.info(`[DATA] POST /payment — ${payment.invoiceId || "(unknown)"}`);
    const saved = await store.savePayment(payment);
    res.json({ ok: true, data: saved, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

module.exports = router;
