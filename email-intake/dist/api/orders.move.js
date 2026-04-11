"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.post("/cheeky/orders/move", async (req, res) => {
    try {
        const { orderId, status } = req.body;
        if (!orderId || !status) {
            return res.status(400).json({
                success: false,
                error: "orderId and status are required"
            });
        }
        const updateData = { status };
        if (status === "IN_PRODUCTION") {
            updateData.productionStartedAt = new Date();
        }
        if (status === "COMPLETED") {
            updateData.productionCompletedAt = new Date();
        }
        const updated = await client_1.db.order.update({
            where: { id: orderId },
            data: updateData
        });
        res.json({
            success: true,
            order: updated
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Failed to move order"
        });
    }
});
exports.default = router;
