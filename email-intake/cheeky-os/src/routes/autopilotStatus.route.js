"use strict";

const express = require("express");
const router = express.Router();
const {
  getAutopilotStatus,
  getAutopilotAudit,
} = require("../services/autopilotControlledActions");

router.get("/api/operator/autopilot-status", async (_req, res) => {
  try {
    return res.json(getAutopilotStatus());
  } catch (err) {
    return res.json({
      mode: String(process.env.AUTOPILOT_MODE || "unknown"),
      enabled: String(process.env.AUTOPILOT || "false").toLowerCase() === "true",
      actionsTakenToday: 0,
      blockedActionsToday: 0,
      createdTasks: 0,
      advancedStatuses: 0,
      lastRunAt: null,
      timestamp: new Date().toISOString(),
      error: err && err.message ? err.message : "autopilot_status_error",
    });
  }
});

router.get("/api/operator/autopilot-audit", async (_req, res) => {
  try {
    return res.json(getAutopilotAudit());
  } catch (_err) {
    return res.json({
      success: true,
      note: "No audit data available",
      actions: [],
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
