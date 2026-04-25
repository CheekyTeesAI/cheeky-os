"use strict";

const express = require("express");
const router = express.Router();

const { CHEEKY_bulkAdvanceOrders } = require("../services/productionService");

router.post("/api/production/bulk-advance", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_bulkAdvanceOrders.
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await CHEEKY_bulkAdvanceOrders(body.orderIds);
    if (!out.success) {
      const status = out.code === "VALIDATION_ERROR" ? 400 : out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
