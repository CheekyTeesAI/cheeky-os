"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const squarePaymentHandler_1 = require("../services/squarePaymentHandler");
const router = (0, express_1.Router)();
router.post("/webhooks/square", async (req, res) => {
    try {
        await (0, squarePaymentHandler_1.handleSquarePaymentWebhook)(req.body ?? {});
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("[square.webhook] Failed to process webhook", error);
        res.status(200).json({ ok: true });
    }
});
exports.default = router;
