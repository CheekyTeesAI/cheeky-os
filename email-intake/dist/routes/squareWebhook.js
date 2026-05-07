"use strict";
/**
 * =============================================================================
 * CANONICAL SQUARE WEBHOOK CONTRACT (email-intake)
 * =============================================================================
 *
 * **Public URL (use in Square Developer Dashboard → Webhooks):**
 *   `POST /api/square/webhook`
 *   Full URL: `https://<your-host>/api/square/webhook`
 *
 * **Production ingestion:** Mount this router at **`/api/square/webhook`** with
 * **`express.raw({ type: "application/json" })` *before* `express.json()`** on the
 * app (see `voice.run.ts`). The handler uses the **exact request bytes** for
 * `verifySquareSignature` (Square HMAC = notification URL + raw body).
 *
 * **Legacy / alternate paths (same repo; do not remove without migration):**
 * - `POST /webhooks/square/webhook` — cheeky-os (`src/webhooks/squareWebhook.js`);
 *   canonical mount uses the same raw + handler via `mountCanonicalInvoiceRaw`.
 * - `POST /webhooks/square` — `square.webhook.ts` → `handleSquarePaymentWebhook` only.
 * - `POST /cheeky/webhooks/square` — `webhooks.square.ts` (legacy pipeline; not interchangeable).
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const squareWebhookService_1 = require("../services/squareWebhookService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
function resolveSquareNotificationUrl(req) {
    const explicit = (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || "").trim();
    if (explicit) {
        return explicit.replace(/\?.*$/, "").replace(/\/+$/, "");
    }
    const protoRaw = String(req.headers["x-forwarded-proto"] || req.protocol || "https");
    const proto = protoRaw.split(",")[0].trim();
    const hostRaw = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const host = hostRaw.split(",")[0].trim();
    const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
    return `${proto}://${host}${pathOnly}`;
}
function rawBodyToString(body) {
    if (Buffer.isBuffer(body)) {
        return body.toString("utf8");
    }
    if (typeof body === "string") {
        return body;
    }
    return "";
}
/** Mounted at `/api/square/webhook` with `express.raw({ type: "application/json" })`. */
router.post("/", async (req, res) => {
    const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
    try {
        const rawStr = rawBodyToString(req.body);
        if (!rawStr.trim()) {
            logger_1.logger.warn(`[square-webhook] phase=request_reject path=${pathOnly} reason=empty_body`);
            res.status(400).json({ success: false, error: "Empty body" });
            return;
        }
        logger_1.logger.info(`[square-webhook] phase=request path=${pathOnly} bodyBytes=${rawStr.length}`);
        const signature = req.header("x-square-hmacsha256-signature");
        (0, squareWebhookService_1.verifySquareSignature)(rawStr, signature, resolveSquareNotificationUrl(req));
        let payload;
        try {
            payload = JSON.parse(rawStr);
        }
        catch {
            logger_1.logger.warn(`[square-webhook] phase=request_reject path=${pathOnly} reason=invalid_json`);
            res.status(400).json({ success: false, error: "Invalid JSON body" });
            return;
        }
        const eid = (0, squareWebhookService_1.extractEventId)(payload) ?? "none";
        const et = (0, squareWebhookService_1.extractEventType)(payload) ?? "unknown";
        logger_1.logger.info(`[square-webhook] phase=ingest path=${pathOnly} eventId=${eid} eventType=${et}`);
        const result = await (0, squareWebhookService_1.processSquareWebhook)(payload);
        if (result.success) {
            res.status(200).json({ success: true, result });
            return;
        }
        logger_1.logger.info(`[square-webhook] phase=handler_done path=${pathOnly} success=false message=${String(result.message).slice(0, 160)}`);
        res.status(200).json({ success: false, error: result.message });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Webhook processing failed";
        const unauthorized = typeof message === "string" &&
            (message.includes("Invalid Square webhook signature") ||
                message.includes("missing x-square-hmacsha256-signature"));
        const status = unauthorized ? 401 : 500;
        logger_1.logger.warn(`[square-webhook] phase=http_error path=${pathOnly} status=${status} message=${String(message).slice(0, 200)}`);
        res.status(status).json({ success: false, error: message });
    }
});
exports.default = router;
