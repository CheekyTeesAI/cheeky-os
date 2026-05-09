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
const {
  syncVoiceSuccessToPrisma,
  notifyOrderConfirmationIfEligible,
} = require("../services/voiceOrderConfirmation.service");

const router = Router();
const MAX_VOICE_TEXT = 8000;

function logSquareStageIfNeeded(action, result) {
  if (!result || !result.data) return;
  const d = result.data;
  if (action !== "create_invoice" && action !== "close_deal") return;
  const inv = action === "close_deal" ? d.invoice : d;
  if (!inv || typeof inv !== "object") return;
  const mode = inv.mode;
  if (mode === "error" || mode === "square_draft" || inv.status === "failed") {
    logger.warn(
      `[VOICE][square] invoice stage incomplete (non-fatal): mode=${mode || "?"} status=${inv.status || "?"}`
    );
  }
}

router.post("/voice/run", async (req, res) => {
  try {
    const body = req.body;
    if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: "invalid_body",
        message: "JSON object body required",
      });
    }

    const textRaw = body.text;
    if (textRaw === undefined || textRaw === null || String(textRaw).trim() === "") {
      return res.status(400).json({
        ok: false,
        data: null,
        error: "missing_text",
        message: 'Missing or empty "text" field',
      });
    }

    const text = String(textRaw).trim();
    if (text.length > MAX_VOICE_TEXT) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: "text_too_long",
        message: `text must be at most ${MAX_VOICE_TEXT} characters`,
      });
    }

    logger.info(`[VOICE] Processing: "${text.slice(0, 200)}${text.length > 200 ? "…" : ""}"`);

    let intent;
    try {
      intent = await parseIntent(text);
    } catch (parseErr) {
      const msg = parseErr && parseErr.message ? parseErr.message : String(parseErr);
      logger.warn(`[VOICE][intent] parse failed (non-fatal): ${msg}`);
      return res.status(200).json({
        ok: false,
        data: null,
        error: `intent_parse_error: ${msg}`,
      });
    }

    const params = { ...intent.params };
    if (body.product != null && String(body.product).trim() !== "") {
      params.product = String(body.product).trim();
    }

    if (intent.intent === "UNKNOWN" || intent.confidence < 0.5) {
      return res.status(200).json({
        ok: false,
        data: { intent: intent.intent, confidence: intent.confidence },
        error: `Could not confidently classify intent (got ${intent.intent} @ ${intent.confidence})`,
      });
    }

    const cmd = intentToCommand(intent.intent, params);
    if (!cmd) {
      return res.status(200).json({
        ok: false,
        data: { intent: intent.intent },
        error: `No executor mapping for intent: ${intent.intent}`,
      });
    }

    let result;
    try {
      result = await executeCommand({
        action: cmd.action,
        params: cmd.params || {},
      });
    } catch (execErr) {
      const msg = execErr && execErr.message ? execErr.message : String(execErr);
      logger.error(`[VOICE][execute] command threw: ${msg}`);
      return res.status(200).json({
        ok: false,
        data: { intent: intent.intent, action: cmd.action },
        error: `execute_error: ${msg}`,
      });
    }

    logSquareStageIfNeeded(cmd.action, result);

    let prismaTaskId = null;
    if (result.ok) {
      let syncMeta = null;
      try {
        syncMeta = await syncVoiceSuccessToPrisma({
          action: cmd.action,
          params: cmd.params || {},
          result,
          meta: {
            fromEmail: body.fromEmail,
            source: body.source || "voice",
          },
        });
        if (syncMeta && syncMeta.taskId) {
          prismaTaskId = syncMeta.taskId;
          logger.info(`[VOICE] Prisma task created: ${syncMeta.taskId} orderId=${syncMeta.orderId}`);
        }
      } catch (syncErr) {
        logger.warn(
          `[VOICE][prisma] sync failed (non-fatal): ${syncErr && syncErr.message ? syncErr.message : syncErr}`
        );
      }
      try {
        if (syncMeta) {
          await notifyOrderConfirmationIfEligible(syncMeta, cmd.params || {}, body, result);
        }
      } catch (notifyErr) {
        logger.warn(
          `[VOICE][notify] failed (non-fatal): ${notifyErr && notifyErr.message ? notifyErr.message : notifyErr}`
        );
      }
    }

    return res.status(200).json({
      ok: result.ok,
      data: {
        intent: intent.intent,
        confidence: intent.confidence,
        params,
        action: cmd.action,
        result: result.data,
        prismaTaskId,
      },
      error: result.error,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    logger.error(`[VOICE] unhandled: ${msg}`);
    return res.status(200).json({
      ok: false,
      data: null,
      error: `voice_internal_error: ${msg}`,
    });
  }
});

router.get("/voice/commands", (_req, res) => {
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

router.post("/voice/shortcut", async (req, res) => {
  try {
    const body = req.body;
    if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: "invalid_body",
        message: "JSON object body required",
      });
    }

    const { intent, params } = body;
    if (intent === undefined || intent === null || String(intent).trim() === "") {
      return res.status(400).json({
        ok: false,
        data: null,
        error: "missing_intent",
        message: 'Missing or empty "intent" field',
      });
    }

    const cmd = intentToCommand(intent, params || {});
    if (!cmd) {
      return res.status(200).json({
        ok: false,
        data: { intent },
        error: `Unknown intent: ${intent}. Valid: ${listShortcutIntents().join(", ")}`,
      });
    }

    logger.info(`[VOICE] Shortcut: ${intent} → ${cmd.action}`);

    let result;
    try {
      result = await executeCommand(cmd);
    } catch (execErr) {
      const msg = execErr && execErr.message ? execErr.message : String(execErr);
      logger.error(`[VOICE][execute] shortcut threw: ${msg}`);
      return res.status(200).json({
        ok: false,
        data: { intent, action: cmd.action },
        error: `execute_error: ${msg}`,
      });
    }

    logSquareStageIfNeeded(cmd.action, result);

    let prismaTaskId = null;
    if (result.ok) {
      try {
        const syncMeta = await syncVoiceSuccessToPrisma({
          action: cmd.action,
          params: cmd.params || {},
          result,
          meta: { source: "voice_shortcut" },
        });
        if (syncMeta && syncMeta.taskId) {
          prismaTaskId = syncMeta.taskId;
          logger.info(`[VOICE] Prisma task created: ${syncMeta.taskId} orderId=${syncMeta.orderId}`);
        }
        if (syncMeta) {
          await notifyOrderConfirmationIfEligible(syncMeta, cmd.params || {}, {}, result);
        }
      } catch (sideErr) {
        logger.warn(
          `[VOICE] shortcut sync/notify (non-fatal): ${sideErr && sideErr.message ? sideErr.message : sideErr}`
        );
      }
    }

    return res.status(200).json({
      ok: result.ok,
      data: { intent, action: cmd.action, result: result.data, prismaTaskId },
      error: result.error,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    logger.error(`[VOICE] shortcut unhandled: ${msg}`);
    return res.status(200).json({
      ok: false,
      data: null,
      error: `voice_internal_error: ${msg}`,
    });
  }
});

module.exports = router;
