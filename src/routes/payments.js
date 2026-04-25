"use strict";

const express = require("express");
const router = express.Router();

const { applyManualDeposit } = require("../services/squareEngine");
const { logError } = require("../middleware/logger");
const { CHEEKY_listPayableOrders } = require("../services/orderService");

/** GET /api/payments — deposit panel source */
router.get("/", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_listPayableOrders.
  try {
    const out = await CHEEKY_listPayableOrders();
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.json({ success: false, error: out.error, code: out.code });
    }
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "payments_fetch_failed",
      code: "PAYMENTS_FETCH_FAILED",
    });
  }
});

/** POST /api/payments/deposit — manual deposit recorded (no auto-send). */
router.post("/deposit", async (req, res) => {
  try {
    const orderId = String((req.body && req.body.orderId) || "").trim();
    const out = await applyManualDeposit(orderId);
    if (!out.success) {
      const status = out.code === "VALIDATION_ERROR" ? 400 : out.code === "NOT_FOUND" ? 404 : 503;
      return res.status(status).json({
        success: false,
        error: out.error || "request_failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    console.log("[CHEEKY-OS v3.2] manual deposit applied orderId=", orderId);
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/payments/deposit", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
