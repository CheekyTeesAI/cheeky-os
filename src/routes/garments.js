"use strict";

const express = require("express");
const router = express.Router();

const { logError } = require("../middleware/logger");
const {
  CHEEKY_markGarmentsOrdered,
  CHEEKY_markGarmentsReceivedOnOrder,
  CHEEKY_completeProduction,
  CHEEKY_completeQC,
} = require("../services/garmentService");

/** POST /api/orders/:orderId/garments/order */
router.post("/:orderId/garments/order", async (req, res) => {
  // [CHEEKY-GATE] Delegated to garmentService.CHEEKY_markGarmentsOrdered.
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return res.status(400).json({ success: false, error: "orderId required", code: "VALIDATION_ERROR" });
    const out = await CHEEKY_markGarmentsOrdered(orderId);
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json(out);
  } catch (err) {
    logError("POST /api/orders/:orderId/garments/order", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

/** POST /api/orders/:orderId/garments/received */
router.post("/:orderId/garments/received", async (req, res) => {
  // [CHEEKY-GATE] Delegated to garmentService.CHEEKY_markGarmentsReceivedOnOrder.
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return res.status(400).json({ success: false, error: "orderId required", code: "VALIDATION_ERROR" });
    const out = await CHEEKY_markGarmentsReceivedOnOrder(orderId);
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json(out);
  } catch (err) {
    logError("POST /api/orders/:orderId/garments/received", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

/** POST /api/orders/:orderId/production/complete */
router.post("/:orderId/production/complete", async (req, res) => {
  // [CHEEKY-GATE] Delegated to garmentService.CHEEKY_completeProduction.
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return res.status(400).json({ success: false, error: "orderId required", code: "VALIDATION_ERROR" });
    const out = await CHEEKY_completeProduction(orderId);
    if (!out.success) {
      const status = out.code === "NOT_FOUND" ? 404 : out.code === "GUARDRAIL" ? 409 : out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json(out);
  } catch (err) {
    logError("POST /api/orders/:orderId/production/complete", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

/** POST /api/orders/:orderId/qc/complete */
router.post("/:orderId/qc/complete", async (req, res) => {
  // [CHEEKY-GATE] Delegated to garmentService.CHEEKY_completeQC.
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return res.status(400).json({ success: false, error: "orderId required", code: "VALIDATION_ERROR" });
    const out = await CHEEKY_completeQC(orderId);
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json(out);
  } catch (err) {
    logError("POST /api/orders/:orderId/qc/complete", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

module.exports = router;
