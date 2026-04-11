"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.get("/cheeky/orders/priority", async (_req, res) => {
    try {
        const orders = await client_1.db.order.findMany();
        const sorted = orders.sort((a, b) => {
            // RUSH FIRST
            if (a.isRush && !b.isRush)
                return -1;
            if (!a.isRush && b.isRush)
                return 1;
            const priorityOrder = (status) => {
                if (status === "READY")
                    return 1;
                if (status === "IN_PRODUCTION")
                    return 2;
                return 3;
            };
            const pA = priorityOrder(a.status);
            const pB = priorityOrder(b.status);
            if (pA !== pB)
                return pA - pB;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        res.json({ success: true, orders: sorted });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Failed to calculate priority"
        });
    }
});
exports.default = router;
