/**
 * Operator console — GET /operator/:role
 * Cheeky OS v3.2 — GET /api/operator/top-actions, /needs-attention
 */
const express = require("express");
const router = express.Router();

const { getOperatorView } = require("../services/operatorViewService");
const { normalizeRole } = require("../config/roles");
const { getTopActions, getNeedsAttention } = require("../services/followupService");
const { logError } = require("../middleware/logger");

function sendView(req, res, role) {
  const r = normalizeRole(role);
  getOperatorView(r)
    .then((payload) => res.status(200).json({ success: true, ...payload }))
    .catch((e) =>
      res.status(200).json({
        success: false,
        error: e && e.message ? e.message : "operator_view_failed",
        role: r,
        sections: [],
      })
    );
}

router.get("/printer", (req, res) => sendView(req, res, "PRINTER"));
router.get("/admin", (req, res) => sendView(req, res, "ADMIN"));
router.get("/owner", (req, res) => sendView(req, res, "OWNER"));
router.get("/design", (req, res) => sendView(req, res, "DESIGN"));

router.get("/top-actions", async (_req, res) => {
  try {
    const out = await getTopActions(30);
    if (!out.success) {
      return res.status(503).json({
        success: false,
        error: out.error || "failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/operator/top-actions", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.get("/needs-attention", async (_req, res) => {
  try {
    const out = await getNeedsAttention(50);
    if (!out.success) {
      return res.status(503).json({
        success: false,
        error: out.error || "failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/operator/needs-attention", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

// POST /api/operator/create-invoice
// Accepts { orderId } in body, loads order from DB, creates a Square DRAFT invoice, and returns { success:true, invoiceId }
router.post("/create-invoice", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = String(body.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: "orderId required", code: "VALIDATION_ERROR" });
    }

    const { getPrisma } = require("../services/decisionEngine");
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const order = await prisma.order.findUnique({
      where: { id: String(orderId) },
      include: { lineItems: true, customer: true, estimate: true },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found", code: "ORDER_NOT_FOUND" });
    }

    const { createDraftInvoice } = require("../services/squareService");

    // Build minimal shape expected by createDraftInvoice
    const quantityFromLineItems = Array.isArray(order.lineItems)
      ? order.lineItems.reduce((s, li) => s + (Number(li.quantity) || 1), 0)
      : 0;

    const orderForSquare = {
      id: order.id,
      quantity: order.quantity || quantityFromLineItems || 1,
      product:
        (order.lineItems && order.lineItems[0] && (order.lineItems[0].name || order.lineItems[0].title)) ||
        order.product ||
        order.name ||
        "Custom Apparel",
      notes: order.notes || order.description || "",
      squareCustomerId:
        (order.customer && (order.customer.squareCustomerId || order.customer.square_customer_id || order.customerId)) ||
        order.squareCustomerId ||
        order.square_customer_id ||
        undefined,
    };

    // estimate optional — pass undefined if not available
    const estimate = order.estimate || undefined;

    const result = await createDraftInvoice(orderForSquare, estimate);

    // createDraftInvoice in this service returns the SDK response result which usually contains an `invoice` object
    const invoiceId =
      (result && result.invoice && (result.invoice.id || result.invoiceId)) || (result && result.id) || null;

    if (!invoiceId) {
      return res.status(502).json({ success: false, error: "invoice_creation_failed", details: result || "unknown" });
    }

    return res.status(200).json({ success: true, invoiceId });
  } catch (err) {
    logError("POST /api/operator/create-invoice", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
