"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.get("/cheeky/orders/ready", async (_req, res) => {
    const orders = await client_1.db.order.findMany({
        where: { status: "READY" },
        orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, orders });
});
router.get("/cheeky/orders/production", async (_req, res) => {
    const orders = await client_1.db.order.findMany({
        where: { status: "IN_PRODUCTION" },
        orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, orders });
});
router.get("/cheeky/orders/completed", async (_req, res) => {
    const orders = await client_1.db.order.findMany({
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, orders });
});
exports.default = router;
