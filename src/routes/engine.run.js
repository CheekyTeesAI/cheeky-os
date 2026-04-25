"use strict";

const express = require("express");
const router = express.Router();

const { runRevenueFollowupScan } = require("../services/revenueFollowupService");
const { logError } = require("../middleware/logger");

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
    if (!out || out.success !== true) {
      console.log("[AGENT COMPLETE]");
      console.log("[AGENT EXIT CLEAN]");
      return res.status(503).json({
        success: false,
        error: (out && out.error) || "engine_run_failed",
        code: (out && out.code) || "ENGINE_FAILED",
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
        error: "Agent timed out (>5s)",
        code: "AGENT_TIMEOUT",
      });
    }
    logError("POST /api/engine/run", err);
    console.log("[AGENT EXIT CLEAN]");
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
