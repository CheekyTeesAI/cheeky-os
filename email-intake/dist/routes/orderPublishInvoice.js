"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderEvaluator_1 = require("../services/orderEvaluator");
const squareInvoicePublishService_1 = require("../services/squareInvoicePublishService");
const safetyGuard_service_1 = require("../services/safetyGuard.service");
const router = (0, express_1.Router)();
router.post("/api/orders/:id/publish-invoice", async (req, res) => {
    try {
        const orderId = String(req.params.id ?? "").trim();
        if (!orderId) {
            res.status(400).json({ success: false, error: "Missing order id" });
            return;
        }
        const result = await (0, squareInvoicePublishService_1.publishAndSendSquareInvoiceForOrder)(orderId);
        res.json({ success: true, result });
    }
    catch (err) {
        if (err instanceof orderEvaluator_1.OrderNotFoundError) {
            res.status(404).json({
                success: false,
                error: err.message,
            });
            return;
        }
        if (err instanceof safetyGuard_service_1.ActionNotAllowedError) {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        const message = err instanceof Error ? err.message : "Failed to publish Square invoice";
        const lower = message.toLowerCase();
        const clientError = lower.includes("must be approved") ||
            lower.includes("draft invoice does not exist") ||
            lower.includes("must be invoice_drafted") ||
            lower.includes("missing order id");
        res.status(clientError ? 400 : 500).json({
            success: false,
            error: message,
        });
    }
});
exports.default = router;
