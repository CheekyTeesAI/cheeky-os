"use strict";

const express = require("express");
const router = express.Router();
const { CHEEKY_getPortalOrder, CHEEKY_approvePortalArt } = require("../services/orderService");

router.get("/api/portal/:token", async (req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_getPortalOrder.
  try {
    const out = await CHEEKY_getPortalOrder(req.params.token);
    if (!out.success) return res.status(out.code === "PORTAL_NOT_FOUND" ? 404 : 503).json({ success: false, error: out.error, code: out.code });
    const order = out.data;
    const paymentLink = order.squareInvoiceId ? `https://squareup.com/pay-invoice/${order.squareInvoiceId}` : null;
    return res.json({ success: true, data: { id: order.id, customerName: order.customerName, status: order.status, nextAction: order.nextAction, notes: order.notes || "", paymentLink, items: order.lineItems || [], artFiles: order.artFiles || [] } });
  } catch (e) { return res.status(500).json({ success: false, error: e && e.message ? e.message : "portal_fetch_failed", code: "PORTAL_FETCH_FAILED" }); }
});

router.post("/api/portal/:token/art/:artId/approve", async (req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_approvePortalArt.
  try {
    const out = await CHEEKY_approvePortalArt(req.params.token, req.params.artId);
    if (!out.success) {
      const status = out.code === "PORTAL_NOT_FOUND" || out.code === "ART_NOT_FOUND" ? 404 : 503;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.json(out);
  } catch (e) { return res.status(500).json({ success: false, error: e && e.message ? e.message : "art_approval_failed", code: "ART_APPROVAL_FAILED" }); }
});

module.exports = router;
