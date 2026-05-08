"use strict";

/**
 * POST /api/cheeky-intake/quote-parse — OpenAI quote for QUOTE_PENDING intake rows.
 * Called from Power Automate (HTTP), internal tools, or future email-intake bridge.
 *
 * Auth: header x-cheeky-intake-key must match CHEEKY_INTAKE_QUOTE_API_KEY (if set).
 *       If CHEEKY_INTAKE_QUOTE_API_KEY unset, endpoint is disabled in production.
 */

const express = require("express");
const path = require("path");

const router = express.Router();
router.use(express.json({ limit: "256kb" }));

const quoteSvc = require(path.join(__dirname, "..", "services", "openaiQuoteIntake.service"));
const ctSync = require(path.join(__dirname, "..", "services", "ctSync.service"));

const ALLOWED_STATUS = new Set(["QUOTE_PENDING", "PARSED"]);

function authOk(req) {
  const expected = String(process.env.CHEEKY_INTAKE_QUOTE_API_KEY || "").trim();
  if (!expected) {
    const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
    if (nodeEnv === "production") {
      return false;
    }
    return true;
  }
  const got = String(
    req.headers["x-cheeky-intake-key"] ||
      req.headers["x-cheeky-internal-key"] ||
      ""
  ).trim();
  return got === expected;
}

router.get("/health", (_req, res) => {
  return res.json({
    ok: true,
    service: "cheeky-intake-quote",
    strictGateDocs:
      "Set CHEEKY_CT_INTAKE_GATE_STRICT; deposit webhooks use ctSync, not this route.",
  });
});

router.post("/quote-parse", async (req, res) => {
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized_intake_quote" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const raw =
    String(body.rawCustomerText || body.rawText || body.text || "").trim() ||
    String(body.ct_raw_payload || "").trim();
  const ctStatus = String(body.ct_status || body.ctStatus || "QUOTE_PENDING").trim();

  if (!ALLOWED_STATUS.has(ctStatus)) {
    return res.status(400).json({
      ok: false,
      error: "ct_status_must_be_PARSED_or_QUOTE_PENDING",
      ctStatus,
    });
  }

  const context = {
    ct_intake_queueid: body.ct_intake_queueid || body.intakeId || null,
    channel: body.channel || null,
    customerEmail: body.customerEmail || body.ct_customer_email || null,
    customerName: body.customerName || body.ct_customer_name || null,
    ct_status: ctStatus,
  };

  try {
    const out = await quoteSvc.parseQuoteForIntake({
      rawCustomerText: raw,
      context,
    });
    if (!out.ok) {
      await ctSync.writeAuditEvent({
        name: "QUOTE_AI_FAILED",
        message: String(out.error || "quote_ai_failed").slice(0, 8000),
        eventType: "FLOW",
        severity: "WARN",
        actor: "system:openaiQuoteIntake",
        payloadJson: JSON.stringify({ context, snippet: raw.slice(0, 1200) }),
      }).catch(() => {});
      return res.status(200).json({ ok: false, ...out });
    }

    return res.status(200).json({
      ok: true,
      quote: out.quote,
      usage: out.usage,
      model: out.model,
      ct_parsed_json: JSON.stringify(out.quote),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

module.exports = router;
