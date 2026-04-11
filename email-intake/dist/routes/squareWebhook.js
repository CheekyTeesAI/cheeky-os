"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const squareWebhookService_1 = require("../services/squareWebhookService");
const router = (0, express_1.Router)();
router.post("/api/square/webhook", async (req, res) => {
    try {
        const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        const signature = req.header("x-square-hmacsha256-signature");
        (0, squareWebhookService_1.verifySquareSignature)(raw, signature);
        const result = await (0, squareWebhookService_1.processSquareWebhook)(req.body);
        if (result.success) {
            res.status(200).json({ success: true, result });
            return;
        }
        res.status(200).json({ success: false, error: result.message });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Webhook processing failed";
        res.status(500).json({ success: false, error: message });
    }
});
exports.default = router;
