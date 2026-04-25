"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Signature failure behavior aligned to 401
// - Deposit timestamps enforced before production unlock

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { getPrisma } = require("../services/decisionEngine");
const { CHEEKY_processSquareWebhookEvent } = require("../services/squareEngine");

const router = express.Router();

function verifySignature(body, signature, url, key) {
  if (!key || !signature || !url) return false;

  const hmac = crypto.createHmac("sha256", key);
  hmac.update(url + body);
  const expected = hmac.digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeInvoiceId(event) {
  return (
    event &&
    event.data &&
    event.data.object &&
    event.data.object.invoice_payment &&
    event.data.object.invoice_payment.invoice_id
  ) || null;
}

router.post("/webhooks/square", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.status(200).json({ success: false, code: "DB_UNAVAILABLE" });

    const signature = req.headers["x-square-hmacsha256-signature"];
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");

    const isValid = verifySignature(
      body,
      signature,
      process.env.SQUARE_WEBHOOK_NOTIFICATION_URL,
      process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    );

    if (!isValid) {
      console.log("[WEBHOOK] Invalid signature");
      return res.status(401).send("Invalid signature");
    }

    let event;
    try {
      event = JSON.parse(body);
    } catch (_e) {
      console.log("[WEBHOOK] Malformed event body ignored");
      return res.status(200).json({ success: false, code: "INVALID_JSON" });
    }

    try {
      const processSquarePaymentWebhook = require(path.join(
        __dirname,
        "..",
        "..",
        "email-intake",
        "cheeky-os",
        "src",
        "actions",
        "processSquarePaymentWebhook"
      ));
      await processSquarePaymentWebhook(event || {});
    } catch (e) {
      console.log("[Square Sync Non-Fatal Error]", e && e.message ? e.message : e);
    }

    const eventType = String((event && event.type) || "");
    const eventId = String((event && event.event_id) || (event && event.id) || "").trim();
    console.log("[WEBHOOK EVENT]", eventType || "UNKNOWN");

    if (!eventType) {
      return res.status(200).json({ success: true, ignored: "missing_event_type" });
    }

    // [CHEEKY-GATE] All DB operations delegated to squareEngine.CHEEKY_processSquareWebhookEvent.
    const out = await CHEEKY_processSquareWebhookEvent(event, eventId, eventType);
    if (out && out.duplicate) return res.status(200).json({ success: true, duplicate: true });
    if (out && out.ignored) return res.status(200).json({ success: true, ignored: out.ignored });
    if (out && !out.success) return res.status(200).json({ success: false, code: out.code });

    return res.status(200).json({ success: true });
  } catch (e) {
    console.log("[WEBHOOK ERROR]", e && e.message ? e.message : e);
    return res.status(200).json({ success: false });
  }
});

module.exports = router;
