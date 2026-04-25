"use strict";

const express = require("express");
const router = express.Router();

const { CHEEKY_listGarmentsToOrder, CHEEKY_placeGarmentOrder } = require("../services/garmentService");
const { determineVendorRoute } = require("../services/vendorRoutingService");
const { buildGarmentPacket } = require("../services/garmentPacketService");

router.get("/api/garments/to-order", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to garmentService.CHEEKY_listGarmentsToOrder.
  try {
    const out = await CHEEKY_listGarmentsToOrder();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    const data = out.data.map((o) => { const route = determineVendorRoute(o); const packet = buildGarmentPacket(o); return { orderId: o.id, customerName: o.customerName, vendor: route.vendorName, route: route.vendorRoute, reason: route.reason, packet }; });
    return res.status(200).json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, error: e && e.message ? e.message : "internal_error", code: "INTERNAL_ERROR" }); }
});

router.post("/api/garments/order/:orderId", async (req, res) => {
  // [CHEEKY-GATE] Delegated to garmentService.CHEEKY_placeGarmentOrder.
  try {
    const out = await CHEEKY_placeGarmentOrder(req.params.orderId);
    if (!out.success) {
      const status = out.code === "DEPOSIT_REQUIRED" ? 409 : out.code === "VALIDATION_ERROR" ? 400 : 503;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json(out);
  } catch (e) { return res.status(500).json({ success: false, error: e && e.message ? e.message : "internal_error", code: "INTERNAL_ERROR" }); }
});

module.exports = router;
