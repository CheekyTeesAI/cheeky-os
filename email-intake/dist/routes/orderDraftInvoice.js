"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const squareInvoiceService_1 = require("../services/squareInvoiceService");
const orderEvaluator_1 = require("../services/orderEvaluator");
const router = (0, express_1.Router)();
router.post("/api/orders/:id/create-draft-invoice", async (req, res) => {
    try {
        const orderId = String(req.params.id ?? "").trim();
        if (!orderId) {
            res.status(400).json({ success: false, error: "Missing order id" });
            return;
        }
        const result = await (0, squareInvoiceService_1.createSquareDraftInvoiceForOrder)(orderId);
        res.json({ success: true, result });
    }
    catch (err) {
        if (err instanceof orderEvaluator_1.OrderNotFoundError) {
            res.status(404).json({ success: false, error: err.message });
            return;
        }
        if (err instanceof squareInvoiceService_1.OrderNotEligibleForInvoiceError) {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        const message = err instanceof Error ? err.message : "Failed to create draft invoice";
        res.status(500).json({ success: false, error: message });
    }
});
exports.default = router;
