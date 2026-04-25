"use strict";

const express = require("express");
const router = express.Router();

const { autoGenerateEstimateFromOrder } = require("../services/autoEstimateService");
const { logError } = require("../middleware/logger");

router.post("/auto-from-order/:orderId", async (req, res) => {
  try {
    const out = await autoGenerateEstimateFromOrder(req.params.orderId);
    if (!out.success) {
      const status = out.code === "NOT_FOUND" ? 404 : out.code === "VALIDATION_ERROR" ? 400 : 503;
      return res.status(status).json({
        success: false,
        error: out.error || "auto_estimate_failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/estimates/auto-from-order/:orderId", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
