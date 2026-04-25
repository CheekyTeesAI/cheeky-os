"use strict";

const express = require("express");
const router = express.Router();
const { CHEEKY_markOutsourceShipped, CHEEKY_markOutsourceDelivered } = require("../services/productionService");

router.post("/api/outsource/:jobId/ship", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_markOutsourceShipped.
  try {
    const { shippingMethod, trackingNumber } = req.body || {};
    const out = await CHEEKY_markOutsourceShipped(req.params.jobId, shippingMethod, trackingNumber);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "outsource_ship_failed", code: "OUTSOURCE_SHIP_FAILED" }); }
});

router.post("/api/outsource/:jobId/delivered", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_markOutsourceDelivered.
  try {
    const out = await CHEEKY_markOutsourceDelivered(req.params.jobId);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "outsource_delivered_failed", code: "OUTSOURCE_DELIVERED_FAILED" }); }
});

module.exports = router;
