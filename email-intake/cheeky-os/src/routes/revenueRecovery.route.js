"use strict";

const express = require("express");
const router = express.Router();
const revenueRecovery = require("../../services/revenueRecoveryEngine.service");

router.get("/api/followups/today", async (_req, res) => {
  try {
    const body = await revenueRecovery.buildFollowupsTodayPayload();
    return res.json({ ...body, ...revenueRecovery.REVENUE_RECOVERY_META });
  } catch (err) {
    console.error("[followups/today]", err && err.message ? err.message : err);
    return res.status(200).json({
      total: 0,
      highPriority: [],
      quickWins: [],
      messagesReady: [],
      estimatedRecoverableUsd: 0,
      error: err && err.message ? err.message : String(err),
      ...revenueRecovery.REVENUE_RECOVERY_META,
    });
  }
});

module.exports = router;
