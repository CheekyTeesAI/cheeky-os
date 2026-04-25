"use strict";

/**
 * Cheeky OS v3.3 — GET /api/production/queue (decision queue: Jeremy + ready to print).
 * Mounted before legacy /api/production router so this handler runs first for GET /queue.
 */
const express = require("express");
const router = express.Router();

const { logError } = require("../middleware/logger");
const { CHEEKY_listProductionQueueV33 } = require("../services/orderService");

router.get("/queue", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_listProductionQueueV33.
  try {
    console.log("[STABLE MODE] Executing: GET /api/production/queue");
    const out = await CHEEKY_listProductionQueueV33();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/production/queue v3.3", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

router.use((req, res, next) => {
  next();
});

module.exports = router;
