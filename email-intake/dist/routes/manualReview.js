"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const manualReviewService_1 = require("../services/manualReviewService");
const router = (0, express_1.Router)();
router.post("/api/manual-review/resolve", async (req, res) => {
    try {
        const body = req.body ?? {};
        const exceptionReviewId = String(body.exceptionReviewId ?? "").trim();
        const resolvedBy = String(body.resolvedBy ?? "").trim();
        const oo = body.orderOverride;
        const orderOverride = oo && typeof oo === "object"
            ? {
                orderId: String(oo.orderId ?? "").trim(),
                reason: String(oo.reason ?? "").trim(),
                by: String(oo.by ?? resolvedBy).trim(),
                clearBlockedReason: Boolean(oo.clearBlockedReason),
            }
            : undefined;
        if (orderOverride && !orderOverride.orderId) {
            res.status(400).json({
                success: false,
                error: "orderOverride.orderId is required when orderOverride is sent",
            });
            return;
        }
        const result = await (0, manualReviewService_1.processManualReviewResolve)({
            exceptionReviewId,
            resolvedBy,
            ...(orderOverride && orderOverride.orderId ? { orderOverride } : {}),
        });
        res.json({ success: true, result });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Manual review resolve failed";
        const client = message.includes("required") || message.includes("not found");
        res.status(client ? 400 : 500).json({ success: false, error: message });
    }
});
exports.default = router;
