/**
 * Cheeky OS — Route: control.js
 * Business action endpoints: run-all, followups, build, rollback, quote, close, intake, leads.
 *
 * @module cheeky-os/routes/control
 */

const { Router } = require("express");
const { runFollowups } = require("../engine/followup");
const { getCashSummary } = require("../engine/cash");
const { generateQuote, closeDeal, getPipeline, getHotLeads, createInvoice } = require("../engine/sales");
const { createSquareInvoice } = require("../integrations/square");
const { processIntake } = require("../engine/intake");
const { runOutreach } = require("../engine/leads");
const { getProductionQueue } = require("../engine/production");
const { validateBuild } = require("../safety/validate-build");
const { rollback } = require("../safety/rollback");
const { logger } = require("../utils/logger");
const { fetchSafe } = require("../utils/fetchSafe");
const { runFollowupCycle, getHotDeals, getNextSalesActions } = require("../followup/engine");

/** Base URL for internal HTTP calls to this app (must match webhook PORT, default 3001). */
const INTERNAL_BASE = process.env.BASE_URL || "http://localhost:3001";

const router = Router();

// ── POST /run — orchestrated run-all ────────────────────────────────────────
router.post("/run", async (req, res) => {
  logger.info("[CONTROL] POST /run — orchestrated run-all");
  const results = {};

  results.followups = await runFollowups();
  results.cash = await getCashSummary();
  results.pipeline = await getPipeline();
  results.leads = await runOutreach();
  results.queue = await getProductionQueue();

  const allOk = Object.values(results).every((r) => r.ok);
  res.json({ ok: allOk, data: results, error: null });
});

// ── POST /followups — run follow-up cycle ───────────────────────────────────
router.post("/followups", async (req, res) => {
  logger.info("[CONTROL] POST /followups");
  const result = await runFollowups();
  res.json(result);
});

// ── POST /build — validate build + tests ────────────────────────────────────
router.post("/build", (req, res) => {
  logger.info("[CONTROL] POST /build — validating");
  const result = validateBuild();
  res.json({ ok: result.ok, data: { output: result.output }, error: result.ok ? null : "Build validation failed" });
});

// ── POST /rollback — revert last commit on main ────────────────────────────
router.post("/rollback", async (req, res) => {
  logger.info("[CONTROL] POST /rollback");
  const result = await rollback();
  res.json(result);
});

// ── POST /quote — generate a price quote ────────────────────────────────────
router.post("/quote", (req, res) => {
  logger.info("[CONTROL] POST /quote");
  const result = generateQuote(req.body);
  res.json(result);
});

// ── POST /close — close a deal ──────────────────────────────────────────────
router.post("/close", (req, res) => {
  logger.info("[CONTROL] POST /close");
  const result = closeDeal(req.body);
  res.json(result);
});

// ── POST /intake — process an intake order ──────────────────────────────────
router.post("/intake", async (req, res) => {
  logger.info("[CONTROL] POST /intake");
  const result = await processIntake(req.body);
  res.json(result);
});

// ── POST /leads — run outreach ──────────────────────────────────────────────
router.post("/leads", async (req, res) => {
  logger.info("[CONTROL] POST /leads");
  const result = await runOutreach();
  res.json(result);
});

// ── POST /invoice — create an invoice (passes through to Square integration) ─
router.post("/invoice", async (req, res) => {
  logger.info("[CONTROL] POST /invoice");
  const { customerName, customerEmail, title, quantity, unitPrice, pricePerShirt } = req.body || {};
  let { total, deposit } = req.body || {};

  const price = unitPrice || pricePerShirt || 0;
  if (!total && quantity && price) total = quantity * price;
  if (!total) {
    // Fall back to legacy sales.createInvoice if no Square-compatible payload
    const result = await createInvoice(req.body);
    return res.json(result);
  }
  if (deposit === undefined || deposit === null) deposit = Math.round(total * 0.5 * 100) / 100;

  const result = await createSquareInvoice({
    customerName: customerName || "Customer",
    customerEmail: customerEmail || null,
    title: title || "Custom Order",
    quantity: quantity || 1,
    unitPrice: price || total,
    total,
    deposit,
  });
  const ok = result.mode !== "error";
  res.json({ ok, data: result, error: ok ? null : "Invoice creation failed" });
});

// ── POST /deploy — trigger Render deploy hook ───────────────────────────────
router.post("/deploy", async (req, res) => {
  logger.info("[CONTROL] POST /deploy");
  const hookUrl = process.env.RENDER_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    return res.json({ ok: false, data: null, error: "RENDER_DEPLOY_HOOK_URL not set" });
  }
  const result = await fetchSafe(hookUrl, { method: "POST" });
  res.json({ ok: result.ok, data: { triggered: result.ok }, error: result.error });
});

// ── POST /followup2/run — run followup engine 2.0 cycle ─────────────────────
router.post("/followup2/run", async (req, res) => {
  try {
    logger.info("[CONTROL] POST /followup2/run");
    const result = runFollowupCycle();
    res.json({ ok: true, data: result, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /followup2/hot — hot deals from followup engine 2.0 ─────────────────
router.get("/followup2/hot", async (req, res) => {
  try {
    const hot = getHotDeals();
    res.json({ ok: true, data: { count: hot.length, records: hot }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /followup2/next — next sales actions ────────────────────────────────
router.get("/followup2/next", async (req, res) => {
  try {
    const actions = getNextSalesActions();
    res.json({ ok: true, data: { count: actions.length, actions }, error: null });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /payments/sync — proxy to payment sync ─────────────────────────────
router.post("/payments/sync", async (req, res) => {
  try {
    const result = await fetchSafe(`${INTERNAL_BASE}/cheeky/payments/sync`);
    res.json(result.ok ? result.data : { ok: false, data: null, error: result.error });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /payments/open — proxy to open payments ─────────────────────────────
router.get("/payments/open", async (req, res) => {
  try {
    const result = await fetchSafe(`${INTERNAL_BASE}/cheeky/payments/open`);
    res.json(result.ok ? result.data : { ok: false, data: null, error: result.error });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /payments/paid — proxy to paid payments ─────────────────────────────
router.get("/payments/paid", async (req, res) => {
  try {
    const result = await fetchSafe(`${INTERNAL_BASE}/cheeky/payments/paid`);
    res.json(result.ok ? result.data : { ok: false, data: null, error: result.error });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /data/snapshot — proxy to business snapshot ─────────────────────────
router.get("/data/snapshot", async (req, res) => {
  try {
    const result = await fetchSafe(`${INTERNAL_BASE}/cheeky/data/snapshot`);
    res.json(result.ok ? result.data : { ok: false, data: null, error: result.error });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── GET /data/deals/open — proxy to open deals ─────────────────────────────
router.get("/data/deals/open", async (req, res) => {
  try {
    const result = await fetchSafe(`${INTERNAL_BASE}/cheeky/data/deals/open`);
    res.json(result.ok ? result.data : { ok: false, data: null, error: result.error });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

module.exports = router;
