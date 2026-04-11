"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const garmentOrderingService_1 = require("../services/garmentOrderingService");
const safetyGuard_service_1 = require("../services/safetyGuard.service");
const orderEvaluator_1 = require("../services/orderEvaluator");
const router = (0, express_1.Router)();
router.post("/api/orders/:id/order-garments", async (req, res) => {
    try {
        const orderId = String(req.params.id ?? "").trim();
        if (!orderId) {
            res.status(400).json({ success: false, error: "Missing order id" });
            return;
        }
        const result = await (0, garmentOrderingService_1.createGarmentOrderForOrder)(orderId);
        res.json({ success: true, result });
    }
    catch (err) {
        if (err instanceof orderEvaluator_1.OrderNotFoundError) {
            res.status(404).json({ success: false, error: err.message });
            return;
        }
        if (err instanceof safetyGuard_service_1.ActionNotAllowedError) {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        const message = err instanceof Error ? err.message : "Failed to create garment vendor order";
        const client = message.toLowerCase().includes("missing order id");
        res.status(client ? 400 : 500).json({ success: false, error: message });
    }
});
exports.default = router;
