/**
 * Bundle 14 — GET /automation/actions
 * Bundle 15 — POST /automation/execute
 */

const express = require("express");
const { collectAutomationActions } = require("../services/automationActionsService");
const { runAutomationExecute } = require("../services/automationExecuteService");

const router = express.Router();

router.use(express.urlencoded({ extended: true }));

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
