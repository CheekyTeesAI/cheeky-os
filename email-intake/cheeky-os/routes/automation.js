/**
 * Bundle 14 — GET /automation/actions
 * Bundle 15 — POST /automation/execute
 */

const express = require("express");
const { collectAutomationActions } = require("../services/automationActionsService");
const { runAutomationExecute } = require("../services/automationExecuteService");
const {
  prepareMessage,
  isKnownType,
} = require("../services/messagePrepService");

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
