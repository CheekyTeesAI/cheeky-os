"use strict";

const express = require("express");
const router = express.Router();
const { parseMobileIntent } = require("../services/mobileIntentParser");
const { executeMobileCommand } = require("../services/mobileCommandExecutor");

const SUPPORTED_INTENTS = [
  "get_system_status",
  "get_operator_summary",
  "get_unpaid_deposits",
  "get_stuck_production",
  "get_release_queue",
  "get_vendor_drafts",
  "get_top_priorities",
  "get_cash_snapshot",
  "get_runway",
  "get_cash_attention",
  "get_obligations_due_soon",
  "create_internal_task",
  "evaluate_release",
  "create_vendor_draft",
  "run_decision_engine",
];

router.get("/api/mobile/operator/health", async (_req, res) => {
  try {
    return res.json({
      ok: true,
      service: "mobile-operator-bridge",
      timestamp: new Date().toISOString(),
      intentsSupported: SUPPORTED_INTENTS,
    });
  } catch (err) {
    return res.json({
      ok: false,
      service: "mobile-operator-bridge",
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
      intentsSupported: SUPPORTED_INTENTS,
    });
  }
});

router.get("/api/mobile/operator/help", async (_req, res) => {
  try {
    return res.json({
      examples: [
        "show system status",
        "show unpaid deposits",
        "what is stuck in production",
        "create internal task for order 123 to review deposit",
        "evaluate release for task 456",
        "create vendor draft for task 789",
        "show top priorities",
        "what should we do next",
        "run decision engine",
        "show cash snapshot",
        "what is our runway",
        "what cash needs attention",
        "show obligations due soon",
      ],
      blockedExamples: [
        "send invoice to customer",
        "place garment order",
        "text customer",
        "pay that bill",
        "charge customer",
        "borrow money",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      examples: [],
      blockedExamples: [],
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/mobile/operator/command", async (req, res) => {
  try {
    const input = String((req.body && req.body.input) || "").trim();
    const source = String((req.body && req.body.source) || "mobile_text");
    const operator = String((req.body && req.body.operator) || "unknown");
    if (!input) {
      return res.json({
        success: false,
        mode: "mobile_operator",
        intent: "unknown",
        confidence: 0,
        outcome: "clarification_needed",
        message: "I need a command input to continue safely.",
        data: { operator, source },
        timestamp: new Date().toISOString(),
      });
    }

    const parsed = parseMobileIntent(input);
    const result = await executeMobileCommand(parsed, { rawInput: input, source, operator });
    return res.json(result);
  } catch (err) {
    return res.json({
      success: false,
      mode: "mobile_operator",
      intent: "unknown",
      confidence: 0,
      outcome: "blocked",
      message: "That action is blocked in mobile operator mode.",
      reason: err && err.message ? err.message : String(err),
      data: {},
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/mobile/operator/voice", async (req, res) => {
  try {
    const transcript = String((req.body && req.body.transcript) || "").trim();
    const operator = String((req.body && req.body.operator) || "unknown");
    if (!transcript) {
      return res.json({
        success: false,
        mode: "mobile_operator",
        intent: "unknown",
        confidence: 0,
        outcome: "clarification_needed",
        message: "I need a transcript to continue safely.",
        data: { operator, source: "voice" },
        timestamp: new Date().toISOString(),
      });
    }
    const parsed = parseMobileIntent(transcript);
    const result = await executeMobileCommand(parsed, {
      rawInput: transcript,
      source: "voice",
      operator,
    });
    return res.json(result);
  } catch (err) {
    return res.json({
      success: false,
      mode: "mobile_operator",
      intent: "unknown",
      confidence: 0,
      outcome: "blocked",
      message: "That action is blocked in mobile operator mode.",
      reason: err && err.message ? err.message : String(err),
      data: {},
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
