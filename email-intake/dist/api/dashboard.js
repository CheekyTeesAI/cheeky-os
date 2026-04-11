"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.get("/cheeky/dashboard", async (_req, res) => {
    try {
        const orders = await client_1.db.order.findMany();
        const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
        const activeOrders = orders.filter((o) => o.status !== "COMPLETED").length;
        const inProduction = orders.filter((o) => o.status === "IN_PRODUCTION").length;
        const ready = orders.filter((o) => o.status === "READY").length;
        const completed = orders.filter((o) => o.status === "COMPLETED").length;
        res.json({
            success: true,
            metrics: {
                totalOrders: orders.length,
                totalRevenue,
                activeOrders,
                ready,
                inProduction,
                completed
            }
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Failed to load dashboard"
        });
    }
});
exports.default = router;
