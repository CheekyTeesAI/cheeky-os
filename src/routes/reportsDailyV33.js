"use strict";

/**
 * Registers GET /daily for Cheeky OS v3.3 decision report at /api/reports/daily
 * (mounted before legacy reports router; other paths fall through).
 */
const express = require("express");
const router = express.Router();

const { logError } = require("../middleware/logger");
const { CHEEKY_getDailyReport } = require("../services/orderService");

router.get("/daily", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_getDailyReport (v3.3 variant adds engine tag).
  try {
    const out = await CHEEKY_getDailyReport();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    return res.status(200).json({ ...out, data: { ...out.data, engine: "v3.3" } });
  } catch (err) {
    logError("GET /api/reports/daily v3.3", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

router.use((req, res, next) => {
  next();
});

module.exports = router;
