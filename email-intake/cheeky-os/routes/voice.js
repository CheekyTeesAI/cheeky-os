/**
 * Cheeky OS — Route: voice.js
 * Voice/natural-language command endpoints.
 * All execution flows through commands/executor via intent-bridge.
 *
 * POST /voice/run — parse intent + execute
 * GET  /voice/commands — list available commands
 * POST /voice/shortcut — named shortcut execution
 *
 * @module cheeky-os/routes/voice
 */

const { Router } = require("express");
const { parseIntent, ALLOWED_INTENTS } = require("../ai/intent-parser");
const { intentToCommand, listShortcutIntents } = require("../commands/intent-bridge");
const { executeCommand } = require("../commands/executor");
const { logger } = require("../utils/logger");

const router = Router();

// ── POST /voice/run — parse + execute natural language command ──────────────
router.post("/voice/run", async (req, res) => {
  const { text } = req.body || {};
  if (!text) {
    return res.json({ ok: false, data: null, error: 'Missing "text" field in request body' });
  }

  logger.info(`[VOICE] Processing: "${text}"`);
  const intent = await parseIntent(text);

  if (intent.intent === "UNKNOWN" || intent.confidence < 0.5) {
    return res.json({
      ok: false,
      data: { intent: intent.intent, confidence: intent.confidence },
      error: `Could not confidently classify intent (got ${intent.intent} @ ${intent.confidence})`,
    });
  }

  const cmd = intentToCommand(intent.intent, intent.params);
  if (!cmd) {
    return res.json({
      ok: false,
      data: { intent: intent.intent },
      error: `No executor mapping for intent: ${intent.intent}`,
    });
  }

  const result = await executeCommand({
    action: cmd.action,
    params: cmd.params || {}
  });

  res.json({
    ok: result.ok,
    data: {
      intent: intent.intent,
      confidence: intent.confidence,
      params: intent.params,
      action: cmd.action,
      result: result.data,
    },
    error: result.error,
  });
});

// ── GET /voice/commands — list all recognized commands ──────────────────────
router.get("/voice/commands", (req, res) => {
  res.json({
    ok: true,
    data: {
      intents: ALLOWED_INTENTS.filter((i) => i !== "UNKNOWN"),
      examples: [
        { text: "chase deposits", intent: "RUN_FOLLOWUP" },
        { text: "how much cash do we have", intent: "GET_CASH_SUMMARY" },
        { text: "what's in the production queue", intent: "GET_PRODUCTION_QUEUE" },
        { text: "find new leads", intent: "OUTREACH_LEADS" },
        { text: "quote 50 hoodies for River Dance Academy", intent: "GENERATE_QUOTE" },
        { text: "close the deal for Murphy's Pub", intent: "CLOSE_DEAL" },
        { text: "create an invoice for 50 shirts at $12 each", intent: "CREATE_INVOICE" },
        { text: "invoice River Dance Academy for $600", intent: "CREATE_INVOICE" },
        { text: "deploy to production", intent: "TRIGGER_BUILD" },
        { text: "rollback the last deploy", intent: "ROLLBACK" },
      ],
    },
    error: null,
  });
});

// ── POST /voice/shortcut — named shortcut (skip AI parsing) ────────────────
router.post("/voice/shortcut", async (req, res) => {
  const { intent, params } = req.body || {};
  if (!intent) {
    return res.json({ ok: false, data: null, error: 'Missing "intent" field' });
  }

  const cmd = intentToCommand(intent, params || {});
  if (!cmd) {
    return res.json({
      ok: false,
      data: { intent },
      error: `Unknown intent: ${intent}. Valid: ${listShortcutIntents().join(", ")}`,
    });
  }

  logger.info(`[VOICE] Shortcut: ${intent} → ${cmd.action}`);
  const result = await executeCommand(cmd);
  res.json({
    ok: result.ok,
    data: { intent, action: cmd.action, result: result.data },
    error: result.error,
  });
});

module.exports = router;
