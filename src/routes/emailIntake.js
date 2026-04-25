const express = require("express");
const { extractEmailIntent } = require("../services/aiExtractor");
const { scoreAndRank } = require("../services/actionEngine");
const { saveContact, saveAuditLog } = require("../services/storageService");

const router = express.Router();
router.use(express.json());

function emailSignalFromParsed(parsed, raw) {
  const intent = String(parsed.intent || "GENERAL_INQUIRY");
  const amountHint = intent === "PAYMENT" ? 900 : intent === "QUOTE_REQUEST" ? 700 : 350;
  return {
    id: `email_${Date.now()}`,
    source: "email-intake",
    customer: parsed.customer_name || "Unknown Customer",
    summary: `Inbound email intent=${intent} subject=${String(raw.subject || "").slice(0, 64)}`,
    value: amountHint,
    urgency: Math.max(1, Number(parsed.urgency || 2)),
  };
}

async function tryCheekyAiRun(signal) {
  try {
    const response = await fetch("http://127.0.0.1:3000/cheeky-ai/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ injected_signals: [signal] }),
    });
    if (!response.ok) {
      return { success: false, reason: `cheeky_ai_http_${response.status}`, queue: [] };
    }
    const data = await response.json();
    return {
      success: true,
      reason: null,
      queue: Array.isArray(data.queue) ? data.queue : [],
      data,
    };
  } catch (error) {
    return {
      success: false,
      reason: error && error.message ? error.message : "cheeky_ai_call_failed",
      queue: [],
    };
  }
}

async function handleProcess(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const from = String(payload.from || "").trim();
    const subject = String(payload.subject || "").trim();
    const body = String(payload.body || "").trim();

    if (!from || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: from, subject, body",
      });
    }

    const extracted = await extractEmailIntent({ from, subject, body });
    const signal = emailSignalFromParsed(extracted.parsed || {}, { subject });
    const orchestrated = await tryCheekyAiRun(signal);
    const localQueue = scoreAndRank([signal]);

    const responsePayload = {
      success: true,
      route: "/email-intake/process",
      extracted: extracted.parsed,
      used_ai: extracted.used_ai === true,
      extraction_reason: extracted.reason || null,
      suggested_action: extracted.parsed ? extracted.parsed.suggested_action : "EMAIL_RESPONSE",
      queue: orchestrated.success ? orchestrated.queue : localQueue.queue,
      queue_source: orchestrated.success ? "cheeky-ai/run" : "local_action_engine_fallback",
      diagnostics: {
        cheeky_ai_pipe_ok: orchestrated.success,
        cheeky_ai_pipe_reason: orchestrated.reason,
      },
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget persistence for intake context.
    Promise.resolve(
      saveContact({
        from,
        subject,
        customer_name: responsePayload.extracted && responsePayload.extracted.customer_name,
      })
    ).catch((error) => {
      console.warn("[emailIntakeRoute] contact save failed:", error && error.message ? error.message : error);
    });
    Promise.resolve(
      saveAuditLog({
        event: "email_intake_process",
        used_ai: responsePayload.used_ai,
        suggested_action: responsePayload.suggested_action,
        queue_source: responsePayload.queue_source,
      })
    ).catch((error) => {
      console.warn("[emailIntakeRoute] audit save failed:", error && error.message ? error.message : error);
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("[emailIntakeRoute] handleProcess failed:", error && error.message ? error.message : error);
    return res.status(500).json({
      success: false,
      error: error && error.message ? error.message : "email intake process failed",
      timestamp: new Date().toISOString(),
    });
  }
}

router.post("/process", handleProcess);
router.post("/email-intake/process", handleProcess);
router.post("/webhooks/email-intake", handleProcess);

module.exports = router;
