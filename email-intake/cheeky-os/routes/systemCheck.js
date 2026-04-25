/**
 * Bundle 19 — GET /system/check (mounted under /system).
 * Bundle 20 — POST /system/start | POST /system/stop | GET /system/status
 */

const express = require("express");
const path = require("path");
const { runSystemCheck } = require("../services/systemCheckService");
const {
  start: startIntervalRunner,
  stop: stopIntervalRunner,
  getStatus: getIntervalRunnerStatus,
} = require("../services/intervalRunnerService");

const router = express.Router();

/** Route inventory + curl hints (canonical cheeky-os paths). */
router.get("/routes", (_req, res) => {
  res.json({
    success: true,
    service: "cheeky-os",
    note: "Duplicate /api/* mounts may mirror these paths — see server boot logs.",
    routes: [
      { method: "GET", path: "/health", purpose: "Liveness" },
      { method: "GET", path: "/system/health", purpose: "Liveness JSON" },
      { method: "GET", path: "/system/routes", purpose: "This inventory" },
      { method: "GET", path: "/system/check", purpose: "Automated system check" },
      { method: "GET", path: "/production/queue", purpose: "Production queue JSON" },
      { method: "GET", path: "/dashboard/next-action", purpose: "Next sales action" },
      { method: "GET", path: "/dashboard/next-task", purpose: "Alias: same as next-action" },
      { method: "GET", path: "/summary/today", purpose: "Daily summary counts" },
      { method: "GET", path: "/summary/daily-summary", purpose: "Alias: same as /today" },
      { method: "GET", path: "/sales/command-center", purpose: "Sales + reactivation snapshot" },
      { method: "POST", path: "/sales/operator/run", purpose: "Sales operator cycle (body: optional responses[])" },
      { method: "GET", path: "/api/operator/deposit-followups", purpose: "Orders awaiting deposit (PostgreSQL Order)" },
      { method: "GET", path: "/api/operator/garment-orders", purpose: "Garment ordering queue (PostgreSQL)" },
      { method: "POST", path: "/api/orders/:id/garments/mark-ordered", purpose: "Mark garments ordered" },
      { method: "POST", path: "/api/orders/:id/garments/mark-received", purpose: "Mark garments received" },
      { method: "GET", path: "/automation/actions", purpose: "Automation opportunities" },
      { method: "GET", path: "/next/actions", purpose: "Gap / next actions" },
      { method: "POST", path: "/square/create-draft-invoice", purpose: "Square draft invoice" },
      { method: "POST", path: "/api/square/webhook", purpose: "Square invoice webhook (raw JSON + HMAC)" },
      { method: "POST", path: "/webhooks/square/webhook", purpose: "Mirror of canonical webhook" },
    ],
  });
});

router.post("/start", (req, res) => {
  try {
    const { enforceAction, auditResult } = require(path.join(__dirname, "..", "..", "..", "src", "services", "securityEnforcement"));
    const { ACTIONS } = require(path.join(__dirname, "..", "..", "..", "src", "services", "permissionService"));
    if (!enforceAction(req, res, ACTIONS.SYSTEM_INTERVAL_START)) return;
    startIntervalRunner();
    auditResult(req, ACTIONS.SYSTEM_INTERVAL_START, "started", {});
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

router.post("/stop", (req, res) => {
  try {
    const { enforceAction, auditResult } = require(path.join(__dirname, "..", "..", "..", "src", "services", "securityEnforcement"));
    const { ACTIONS } = require(path.join(__dirname, "..", "..", "..", "src", "services", "permissionService"));
    if (!enforceAction(req, res, ACTIONS.SYSTEM_INTERVAL_STOP)) return;
    stopIntervalRunner();
    auditResult(req, ACTIONS.SYSTEM_INTERVAL_STOP, "stopped", {});
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
      shouldNotify: Boolean(out.shouldNotify),
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
      shouldNotify: false,
    });
  }
});

module.exports = router;
