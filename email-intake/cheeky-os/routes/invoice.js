/**
 * Cheeky OS — Route: invoice.js
 * Square invoice creation endpoints.
 *   POST /invoice/create     — create invoice from raw payload
 *   POST /invoice/from-quote — create invoice from a quote result
 *
 * @module cheeky-os/routes/invoice
 */

const { Router } = require("express");
const { createSquareInvoice } = require("../integrations/square");
const { createTrackedInvoice } = require("../followup/engine");
const { trackInvoiceAsDeal } = require("../data/sync");
const { logger } = require("../utils/logger");

const router = Router();

// ── POST /invoice/create — create a Square invoice ──────────────────────────
router.post("/create", async (req, res) => {
  try {
    const { customerName, customerEmail, title, quantity, unitPrice } = req.body || {};
    let { total, deposit } = req.body || {};

    // Auto-calculate total if missing
    if (!total && quantity && unitPrice) {
      total = quantity * unitPrice;
    }

    if (!total) {
      return res.json({ ok: false, data: null, error: "Missing total (or quantity + unitPrice to calculate it)" });
    }

    // Default deposit to 50% if missing
    if (deposit === undefined || deposit === null) {
      deposit = Math.round(total * 0.5 * 100) / 100;
    }

    logger.info(`[INVOICE] POST /create — ${customerName || "(unknown)"}: $${total} (deposit $${deposit})`);

    const result = await createSquareInvoice({
      customerName: customerName || "Customer",
      customerEmail: customerEmail || null,
      title: title || "Custom Order",
      quantity: quantity || 1,
      unitPrice: unitPrice || total,
      total,
      deposit,
    });

    const ok = result.mode !== "error";

    // Auto-track every created invoice in Followup Engine 2.0
    if (ok) {
      try {
        createTrackedInvoice({
          customerName: customerName || "Customer",
          customerEmail: customerEmail || null,
          invoiceId: result.invoiceId || null,
          total,
          deposit,
          notes: `Auto-tracked from /invoice/create — mode: ${result.mode}`,
        });
      } catch (trackErr) {
        logger.error(`[INVOICE] Tracking failed: ${trackErr.message}`);
      }

      // Sync to data layer
      try {
        await trackInvoiceAsDeal({
          customerName: customerName || "Customer",
          customerEmail: customerEmail || null,
          invoiceId: result.invoiceId || null,
          total,
          deposit,
          notes: `Data layer sync from /invoice/create — mode: ${result.mode}`,
        });
      } catch (dlErr) {
        logger.error(`[INVOICE] Data layer sync failed: ${dlErr.message}`);
      }
    }

    res.json({ ok, data: result, error: ok ? null : "Invoice creation failed" });
  } catch (err) {
    logger.error(`[INVOICE] /create error: ${err.message}`);
    res.json({ ok: false, data: null, error: err.message });
  }
});

// ── POST /invoice/from-quote — create invoice from a quote payload ──────────
router.post("/from-quote", async (req, res) => {
  try {
    const { customerName, customerEmail, quantity, title, pricePerShirt } = req.body || {};
    let { total, deposit } = req.body || {};

    const unitPrice = pricePerShirt || 0;

    // Auto-calculate total if missing
    if (!total && quantity && unitPrice) {
      total = quantity * unitPrice;
    }

    if (!total) {
      return res.json({ ok: false, data: null, error: "Missing total (or quantity + pricePerShirt to calculate it)" });
    }

    // Default deposit to 50% if missing
    if (deposit === undefined || deposit === null) {
      deposit = Math.round(total * 0.5 * 100) / 100;
    }

    logger.info(`[INVOICE] POST /from-quote — ${customerName || "(unknown)"}: $${total} (deposit $${deposit})`);

    const result = await createSquareInvoice({
      customerName: customerName || "Customer",
      customerEmail: customerEmail || null,
      title: title || "Custom Order",
      quantity: quantity || 1,
      unitPrice,
      total,
      deposit,
    });

    const ok = result.mode !== "error";

    // Auto-track every created invoice in Followup Engine 2.0
    if (ok) {
      try {
        createTrackedInvoice({
          customerName: customerName || "Customer",
          customerEmail: customerEmail || null,
          invoiceId: result.invoiceId || null,
          total,
          deposit,
          notes: `Auto-tracked from /invoice/from-quote — mode: ${result.mode}`,
        });
      } catch (trackErr) {
        logger.error(`[INVOICE] Tracking failed: ${trackErr.message}`);
      }

      // Sync to data layer
      try {
        await trackInvoiceAsDeal({
          customerName: customerName || "Customer",
          customerEmail: customerEmail || null,
          invoiceId: result.invoiceId || null,
          total,
          deposit,
          notes: `Data layer sync from /invoice/from-quote — mode: ${result.mode}`,
        });
      } catch (dlErr) {
        logger.error(`[INVOICE] Data layer sync failed: ${dlErr.message}`);
      }
    }

    res.json({ ok, data: result, error: ok ? null : "Invoice creation failed" });
  } catch (err) {
    logger.error(`[INVOICE] /from-quote error: ${err.message}`);
    res.json({ ok: false, data: null, error: err.message });
  }
});

module.exports = router;
