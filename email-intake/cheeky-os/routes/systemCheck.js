/**
 * Bundle 19 — GET /system/check (mounted under /system).
 * Bundle 20 — POST /system/start | POST /system/stop | GET /system/status
 */

const express = require("express");
const { runSystemCheck } = require("../services/systemCheckService");
const {
  start: startIntervalRunner,
  stop: stopIntervalRunner,
  getStatus: getIntervalRunnerStatus,
} = require("../services/intervalRunnerService");

const router = express.Router();

router.post("/start", (_req, res) => {
  try {
    startIntervalRunner();
    return res.json({
      success: true,
      message: "System automation started",
    });
  } catch (err) {
    console.error("[system/start]", err.message || err);
    return res.json({
      success: false,
      message: err instanceof Error ? err.message : "Start failed",
    });
  }
});

router.post("/stop", (_req, res) => {
  try {
    stopIntervalRunner();
    return res.json({
      success: true,
      message: "System automation stopped",
    });
  } catch (err) {
    console.error("[system/stop]", err.message || err);
    return res.json({
      success: false,
      message: err instanceof Error ? err.message : "Stop failed",
    });
  }
});

router.get("/status", (_req, res) => {
  try {
    return res.json(getIntervalRunnerStatus());
  } catch (err) {
    console.error("[system/status]", err.message || err);
    return res.json({
      isRunning: false,
      lastRun: "",
      intervalMs: 300000,
    });
  }
});

router.get("/check", async (_req, res) => {
  try {
    const out = await runSystemCheck();
    return res.json({
      timestamp: out.timestamp || new Date().toISOString(),
      summary: out.summary || {},
      actions: out.actions || [],
      alerts: out.alerts || [],
      copilotMessage: out.copilotMessage || "",
      storedAlerts: Array.isArray(out.storedAlerts) ? out.storedAlerts : [],
    });
  } catch (err) {
    console.error("[system/check]", err.message || err);
    return res.json({
      timestamp: new Date().toISOString(),
      summary: {},
      actions: [],
      alerts: [],
      copilotMessage: "System check failed.",
      storedAlerts: [],
    });
  }
});

module.exports = router;
