/**
 * Bundle 14 — GET /automation/actions
 * Bundle 15 — POST /automation/execute
 * OS automation runner — GET /automation/status, POST /automation/run, POST /automation/toggle, GET /automation/logs
 */

const express = require("express");
const path = require("path");
const automationRunner = require(path.join(__dirname, "..", "..", "..", "src", "services", "automationRunner"));
const { getRecentLogs } = require(path.join(__dirname, "..", "..", "..", "src", "services", "automationLogService"));
const { getSchedulerStatus } = require(path.join(__dirname, "..", "..", "..", "src", "services", "automationScheduler"));

const { collectAutomationActions } = require("../services/automationActionsService");
const { runAutomationExecute } = require("../services/automationExecuteService");
const {
  prepareMessage,
  isKnownType,
} = require("../services/messagePrepService");

const router = express.Router();

router.use(express.urlencoded({ extended: true }));

router.get("/status", (_req, res) => {
  try {
    const cfg = automationRunner.getAutomationConfig();
    const st = automationRunner.loadState();
    return res.status(200).json({
      success: true,
      config: cfg,
      paused: !!st.paused,
      scheduler: getSchedulerStatus(),
      dryRun: !!cfg.dryRun,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "status_error",
    });
  }
});

router.post("/run", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const full = body.full === true || String(body.scope || "").toLowerCase() === "full";
    const out = full
      ? await automationRunner.runAutomationCycle({ label: "manual_full", skipGate: true })
      : await automationRunner.runAutomationCycle({
          label: "manual_quick",
          skipGate: true,
          only: ["intake", "jobs", "production", "customerService", "communications"],
        });
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      mock: false,
      error: e && e.message ? e.message : "run_failed",
      errors: [e && e.message ? e.message : "error"],
    });
  }
});

router.post("/toggle", (req, res) => {
  try {
    const { enforceAction, auditResult } = require(path.join(__dirname, "..", "..", "..", "src", "services", "securityEnforcement"));
    const { ACTIONS } = require(path.join(__dirname, "..", "..", "..", "src", "services", "permissionService"));
    if (!enforceAction(req, res, ACTIONS.AUTOMATION_TOGGLE)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.paused === true) {
      automationRunner.setAutomationPaused(true);
    } else if (body.paused === false) {
      automationRunner.setAutomationPaused(false);
    } else {
      const st = automationRunner.loadState();
      automationRunner.setAutomationPaused(!st.paused);
    }
    const st = automationRunner.loadState();
    auditResult(req, ACTIONS.AUTOMATION_TOGGLE, "toggled", { paused: !!st.paused });
    return res.status(200).json({ success: true, paused: !!st.paused });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "toggle_error" });
  }
});

router.get("/logs", (req, res) => {
  try {
    const limit = req.query && req.query.limit ? Number(req.query.limit) : 20;
    const entries = getRecentLogs(limit);
    return res.status(200).json({ success: true, entries });
  } catch (e) {
    return res.status(200).json({ success: false, entries: [], error: e && e.message ? e.message : "logs_error" });
  }
});

router.get("/actions", async (_req, res) => {
  try {
    const data = await collectAutomationActions(10);
    return res.json(data);
  } catch (err) {
    console.error("[automation/actions]", err.message || err);
    return res.json({ actions: [] });
  }
});

/**
 * Accepts JSON or application/x-www-form-urlencoded (founder dashboard forms).
 * @param {import("express").Request} req
 */
function normalizeExecuteBody(req) {
  const b = req.body || {};
  let payload = b.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    payload = {};
  }
  return {
    approved: b.approved,
    actionType: b.actionType,
    orderId: b.orderId,
    customerId: b.customerId,
    payload,
  };
}

router.post("/prepare-message", (req, res) => {
  try {
    const body = req.body || {};
    const typeRaw = String(body.type || "").trim().toLowerCase();
    if (!typeRaw) {
      return res.json({
        success: false,
        message: "type is required (followup, invoice, reactivation, new_lead)",
        type: "",
      });
    }
    if (!isKnownType(typeRaw)) {
      return res.json({
        success: false,
        message:
          "invalid type — use followup, invoice, reactivation, or new_lead",
        type: typeRaw,
      });
    }
    const out = prepareMessage({
      type: typeRaw,
      customerName: body.customerName,
      amount: body.amount,
      daysOld: body.daysOld,
    });
    return res.json({
      success: true,
      message: out.message,
      type: out.type,
    });
  } catch (err) {
    console.error("[automation/prepare-message]", err.message || err);
    const fallback = prepareMessage({
      type: "followup",
      customerName: (req.body && req.body.customerName) || "",
      amount: req.body && req.body.amount,
      daysOld: req.body && req.body.daysOld,
    });
    return res.json({
      success: true,
      message: fallback.message,
      type: fallback.type,
    });
  }
});

router.post("/execute", async (req, res) => {
  try {
    const body = normalizeExecuteBody(req);
    const { status, json } = await runAutomationExecute(body);
    return res.status(status).json(json);
  } catch (err) {
    console.error("[automation/execute]", err.message || err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
