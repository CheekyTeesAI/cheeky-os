"use strict";

const express = require("express");
const router = express.Router();

const { logError } = require("../middleware/logger");
const { CHEEKY_getDailyReport } = require("../services/orderService");

/** GET /api/reports/os/daily — revenue at risk, stuck orders, top 3 actions. */
router.get("/daily", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_getDailyReport.
  try {
    const out = await CHEEKY_getDailyReport();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    return res.status(200).json(out);
  } catch (err) {
    logError("GET /api/reports/os/daily", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

module.exports = router;
