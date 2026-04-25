"use strict";

const express = require("express");
const router = express.Router();

const {
  verifySquareSignature,
  processLegacyPaymentJsonPayload,
} = require("../services/squareEngine");
const { logError } = require("../middleware/logger");

function resolveSquareNotificationUrl(req) {
  const explicit = String(process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || "").trim();
  if (explicit) {
    return explicit.split("?")[0].replace(/\/+$/, "");
  }
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
  return `${proto}://${host}${pathOnly}`;
}

/** POST /api/cheeky-webhooks/square — raw JSON + optional signature; idempotent. */
router.post(
  "/square",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
    try {
      const rawStr = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
      if (!rawStr.trim()) {
        console.log("BLOCKED: empty webhook body", pathOnly);
        return res.status(400).json({
          success: false,
          error: "Empty body",
          code: "EMPTY_BODY",
        });
      }
      const signature = req.header("x-square-hmacsha256-signature");
      try {
        verifySquareSignature(rawStr, signature, resolveSquareNotificationUrl(req));
      } catch (sigErr) {
        logError("webhooks/square signature", sigErr);
        return res.status(401).json({
          success: false,
          error: sigErr && sigErr.message ? sigErr.message : "invalid_signature",
          code: "SIGNATURE_INVALID",
        });
      }
      let payload;
      try {
        payload = JSON.parse(rawStr);
      } catch {
        console.log("BLOCKED: invalid json", pathOnly);
        return res.status(400).json({
          success: false,
          error: "Invalid JSON",
          code: "INVALID_JSON",
        });
      }
      const out = await processLegacyPaymentJsonPayload(payload);
      if (!out.success) {
        return res.status(200).json({
          success: false,
          error: out.error || "webhook_failed",
          code: out.code || "WEBHOOK_FAILED",
        });
      }
      return res.status(200).json({ success: true, data: out.data });
    } catch (err) {
      logError("POST /api/cheeky-webhooks/square", err);
      return res.status(500).json({
        success: false,
        error: err && err.message ? err.message : "internal_error",
        code: "INTERNAL_ERROR",
      });
    }
  }
);

module.exports = router;
