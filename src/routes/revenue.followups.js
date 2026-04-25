"use strict";

const express = require("express");
const router = express.Router();

const { runRevenueFollowupScan, startRevenueFollowupCron } = require("../services/revenueFollowupService");
const { getRevenueOpportunities } = require("../services/revenuePriorityService");
const { logError } = require("../middleware/logger");

startRevenueFollowupCron();

function runWithTimeout(work, timeoutMs) {
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("AGENT_TIMEOUT")), timeoutMs);
    }),
  ]);
}

router.post("/run", async (_req, res) => {
  console.log("[AGENT START]");
  try {
    const out = await runWithTimeout(() => runRevenueFollowupScan(), 5000);
    if (!out.success) {
      console.log("[AGENT COMPLETE]");
      console.log("[AGENT EXIT CLEAN]");
      return res.status(503).json({
        success: false,
        error: out.error || "scan_failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    console.log("[AGENT COMPLETE]");
    console.log("[AGENT EXIT CLEAN]");
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    if (err && err.message === "AGENT_TIMEOUT") {
      console.log("[MEMORY GUARD TRIGGERED]");
      return res.status(504).json({
        success: false,
        error: "Follow-up run timed out (>5s)",
        code: "AGENT_TIMEOUT",
      });
    }
    logError("POST /api/revenue/followups/run", err);
    console.log("[AGENT EXIT CLEAN]");
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.get("/opportunities", async (req, res) => {
  console.log("[AGENT START]");
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50) || 50));
    const out = await runWithTimeout(() => getRevenueOpportunities(limit), 5000);
    if (!out.success) {
      console.log("[AGENT COMPLETE]");
      console.log("[AGENT EXIT CLEAN]");
      return res.status(503).json({
        success: false,
        error: out.error || "query_failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    console.log("[AGENT COMPLETE]");
    console.log("[AGENT EXIT CLEAN]");
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    if (err && err.message === "AGENT_TIMEOUT") {
      console.log("[MEMORY GUARD TRIGGERED]");
      return res.status(504).json({
        success: false,
        error: "Opportunity run timed out (>5s)",
        code: "AGENT_TIMEOUT",
      });
    }
    logError("GET /api/revenue/opportunities", err);
    console.log("[AGENT EXIT CLEAN]");
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
