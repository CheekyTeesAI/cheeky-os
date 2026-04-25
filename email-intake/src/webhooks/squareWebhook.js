"use strict";

/**
 * Square webhook router — mounted as Express middleware on /api and /webhooks.
 * Handles POST /square (payment.completed JSON) and
 * POST /square/webhook (raw HMAC-signed Square events).
 */

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

function verifySquareHmac(req) {
  const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!sigKey) return true; // skip if not configured
  const skip = process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY === "true";
  if (skip) return true;
  const sig = req.headers["x-square-hmacsha256-signature"];
  if (!sig) return false;
  const url = String(process.env.PUBLIC_BASE_URL || "").trim() + req.originalUrl;
  const body = req.body && Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  const hmac = crypto
    .createHmac("sha256", sigKey)
    .update(url + body.toString("utf8"))
    .digest("base64");
  return hmac === sig;
}

/**
 * Mount the canonical raw-body Square webhook route BEFORE express.json().
 * Called by server.js if this export exists.
 */
function mountCanonicalInvoiceRaw(app) {
  app.post(
    "/api/square/webhook",
    express.raw({ type: "*/*", limit: "2mb" }),
    (req, res) => {
      if (!verifySquareHmac(req)) {
        console.warn("[squareWebhook] HMAC verification failed");
        return res.status(403).json({ ok: false, error: "invalid_signature" });
      }
      let event = {};
      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch (_) {
        return res.status(400).json({ ok: false, error: "invalid_json" });
      }
      console.log("[squareWebhook] canonical event:", event.type || "unknown");
      return res.json({ ok: true, received: true });
    }
  );

  app.post(
    "/webhooks/square/webhook",
    express.raw({ type: "*/*", limit: "2mb" }),
    (req, res) => {
      if (!verifySquareHmac(req)) {
        console.warn("[squareWebhook] HMAC verification failed (mirror)");
        return res.status(403).json({ ok: false, error: "invalid_signature" });
      }
      let event = {};
      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch (_) {
        return res.status(400).json({ ok: false, error: "invalid_json" });
      }
      console.log("[squareWebhook] mirror event:", event.type || "unknown");
      return res.json({ ok: true, received: true });
    }
  );
}

// JSON-only legacy handler for POST /square and POST /webhooks/square
router.post("/square", express.json(), (req, res) => {
  const body = req.body || {};
  const type = body.type || body.event_type || "unknown";
  console.log("[squareWebhook] legacy POST /square event:", type);
  return res.json({ ok: true, received: true, type });
});

router.post("/square/payment", express.json(), (req, res) => {
  console.log("[squareWebhook] payment event");
  return res.json({ ok: true, received: true });
});

module.exports = router;
module.exports.mountCanonicalInvoiceRaw = mountCanonicalInvoiceRaw;
