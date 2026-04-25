"use strict";

const express = require("express");
const router = express.Router();

const { importRecentOrders, importOrderBySquareId } = require("../services/squareImportService");
const { logError } = require("../middleware/logger");

router.post("/recent", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const limit = Math.min(100, Math.max(1, parseInt(String(body.limit || "30"), 10) || 30));
    const out = await importRecentOrders({ limit });
    if (!out.success) {
      return res.status(out.code === "SQUARE_CONFIG" ? 503 : 502).json({
        success: false,
        error: out.error || "import_failed",
        code: out.code || "IMPORT_FAILED",
      });
    }
    console.log("AI-HOOK: square import recent count=", out.data && out.data.count);
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/square/import/recent", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.post("/by-id", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const squareOrderId = String(body.squareOrderId || body.squareId || body.id || "").trim();
    if (!squareOrderId) {
      return res.status(400).json({
        success: false,
        error: "squareOrderId required",
        code: "VALIDATION_ERROR",
      });
    }
    const out = await importOrderBySquareId(squareOrderId);
    if (!out.success) {
      const status = out.code === "SQUARE_CONFIG" ? 503 : 502;
      return res.status(status).json({
        success: false,
        error: out.error || "import_failed",
        code: out.code || "IMPORT_FAILED",
      });
    }
    console.log("AI-HOOK: square import by-id squareOrderId=", squareOrderId);
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/square/import/by-id", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
