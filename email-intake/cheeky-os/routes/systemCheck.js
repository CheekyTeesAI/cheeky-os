/**
 * Bundle 19 — GET /system/check (mounted under /system).
 */

const express = require("express");
const { runSystemCheck } = require("../services/systemCheckService");

const router = express.Router();

router.get("/check", async (_req, res) => {
  try {
    const out = await runSystemCheck();
    return res.json({
      timestamp: out.timestamp || new Date().toISOString(),
      summary: out.summary || {},
      actions: out.actions || [],
      alerts: out.alerts || [],
      copilotMessage: out.copilotMessage || "",
    });
  } catch (err) {
    console.error("[system/check]", err.message || err);
    return res.json({
      timestamp: new Date().toISOString(),
      summary: {},
      actions: [],
      alerts: [],
      copilotMessage: "System check failed.",
    });
  }
});

module.exports = router;
