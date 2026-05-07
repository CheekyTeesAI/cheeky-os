"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const squarePaymentHandler_1 = require("../services/squarePaymentHandler");
const router = (0, express_1.Router)();
function isSquareV2WebhookShape(body) {
    if (!body || typeof body !== "object")
        return false;
    const b = body;
    const id = typeof b.event_id === "string" ? b.event_id : typeof b.eventId === "string" ? b.eventId : "";
    return Boolean(id && b.data && typeof b.data === "object");
}
router.post("/webhooks/square", async (req, res) => {
    try {
        const body = req.body ?? {};
        if (isSquareV2WebhookShape(body)) {
            // Delegates to same pipeline as POST /webhooks/square/webhook (no second HTTP hop).
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const swMod = require("../webhooks/squareWebhook");
            const { result } = await swMod.runCanonicalSquareWebhookPipeline(body, "legacy_POST_webhooks_square_delegate");
            return res.status(200).json({ ok: true, delegatedTo: "canonical_pipeline", result });
        }
        await (0, squarePaymentHandler_1.handleSquarePaymentWebhook)(body);
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("[square.webhook] Failed to process webhook", error);
        res.status(200).json({ ok: true });
    }
});
exports.default = router;
