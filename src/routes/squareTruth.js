/**
 * Square live read / write / sync — JSON only; failures do not throw out of handlers.
 */
const express = require("express");
const router = express.Router();

const { getSquareMode } = require("../services/squareConfigService");
const {
  getSquareInvoices,
  getSquareEstimates,
  getSquarePayments,
  getSquareCustomers,
} = require("../services/squareReadService");
const {
  previewQuoteDraft,
  createDraftQuote,
  previewInvoiceDraft,
  createDraftInvoice,
} = require("../services/squareWriteService");
const { reconcileSquareToSystem } = require("../services/financialReconciliationService");
const {
  syncFromSquare,
  getSquareDashboardBundle,
  getLastSyncMeta,
} = require("../services/squareSyncEngine");

router.get("/status", (req, res) => {
  try {
    const cfg = getSquareMode();
    return res.status(200).json({ success: true, ...cfg, mock: cfg.mode !== "LIVE" });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/sync", async (req, res) => {
  try {
    const dry = req.query.dry === "1" || req.query.preview === "1";
    if (dry) {
      const bundle = await getSquareDashboardBundle();
      return res.status(200).json({ success: true, dryRun: true, ...bundle, mock: bundle.squareStatus && bundle.squareStatus.mock });
    }
    const out = await syncFromSquare();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/invoices", async (req, res) => {
  try {
    const out = await getSquareInvoices();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, invoices: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/estimates", async (req, res) => {
  try {
    const out = await getSquareEstimates();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, estimates: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/payments", async (req, res) => {
  try {
    const out = await getSquarePayments();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, payments: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/reconcile", async (req, res) => {
  try {
    const out = await reconcileSquareToSystem();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/quote/preview", async (req, res) => {
  try {
    const out = await previewQuoteDraft(req.body || {});
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      mode: "PREVIEW",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      error: e && e.message ? e.message : "error",
    });
  }
});

router.post("/quote/create", async (req, res) => {
  try {
    const { enforceAction, auditResult } = require("../services/securityEnforcement");
    const { ACTIONS } = require("../services/permissionService");
    if (!enforceAction(req, res, ACTIONS.SQUARE_QUOTE_CREATE)) return;
    const body = req.body && typeof req.body === "object" ? { ...req.body, mode: "CREATE" } : { mode: "CREATE" };
    const out = await createDraftQuote(body);
    auditResult(req, ACTIONS.SQUARE_QUOTE_CREATE, out.created ? "created" : "ok", { mode: "CREATE" });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      mode: "CREATE",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      error: e && e.message ? e.message : "error",
    });
  }
});

router.post("/invoice/preview", async (req, res) => {
  try {
    const out = await previewInvoiceDraft(req.body || {});
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      mode: "PREVIEW",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      error: e && e.message ? e.message : "error",
    });
  }
});

router.post("/invoice/create", async (req, res) => {
  try {
    const { enforceAction, auditResult } = require("../services/securityEnforcement");
    const { ACTIONS } = require("../services/permissionService");
    if (!enforceAction(req, res, ACTIONS.SQUARE_INVOICE_CREATE)) return;
    const body = req.body && typeof req.body === "object" ? { ...req.body, mode: "CREATE" } : { mode: "CREATE" };
    const out = await createDraftInvoice(body);
    auditResult(req, ACTIONS.SQUARE_INVOICE_CREATE, out.created ? "created" : "ok", { mode: "CREATE" });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      mode: "CREATE",
      success: false,
      mock: true,
      created: false,
      squareIds: {},
      error: e && e.message ? e.message : "error",
    });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const bundle = await getSquareDashboardBundle();
    return res.status(200).json({ success: true, ...bundle, lastSyncMeta: getLastSyncMeta() });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
