/**
 * Mounted by cheeky-os/server.js at app.use("/webhooks", ...).
 * Canonical URLs (with default PORT=3000):
 *   POST /webhooks/square/webhook — HMAC-verified pipeline (invoice/payment updates → Prisma)
 *   POST /webhooks/square — legacy payment handler (payment.completed → tasks)
 *
 * Depends on compiled output in ../dist (run `npm run build` in email-intake).
 */
const express = require("express");
const path = require("path");
function loadDist() {
    const base = path.join(__dirname, "..", "..", "dist", "services");
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const webhookSvc = require(path.join(base, "squareWebhookService"));
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const paymentSvc = require(path.join(base, "squarePaymentHandler"));
    return {
        processSquareWebhook: webhookSvc.processSquareWebhook,
        verifySquareSignature: webhookSvc.verifySquareSignature,
        handleSquarePaymentWebhook: paymentSvc.handleSquarePaymentWebhook,
    };
}
let cached;
function services() {
    if (!cached) {
        cached = loadDist();
    }
    return cached;
}
const router = express.Router();
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
router.post("/square/webhook", express.json({ limit: "2mb" }), async (req, res) => {
    try {
        const { processSquareWebhook, verifySquareSignature } = services();
        const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        const signature = req.header("x-square-hmacsha256-signature");
        verifySquareSignature(raw, signature, resolveSquareNotificationUrl(req));
        const result = await processSquareWebhook(req.body);
        if (result.success) {
            res.status(200).json({ success: true, result });
            return;
        }
        res.status(200).json({ success: false, error: result.message });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Webhook processing failed";
        const unauthorized = typeof message === "string" &&
            (message.includes("Invalid Square webhook signature") ||
                message.includes("missing x-square-hmacsha256-signature"));
        res.status(unauthorized ? 401 : 500).json({ success: false, error: message });
    }
});
router.post("/square", express.json({ limit: "2mb" }), async (req, res) => {
    try {
        const { handleSquarePaymentWebhook } = services();
        await handleSquarePaymentWebhook(req.body ?? {});
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("[webhooks/square] payment handler failed", error);
        res.status(200).json({ ok: true });
    }
});
module.exports = router;
