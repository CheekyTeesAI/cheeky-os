"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.get("/cheeky/orders", async (req, res) => {
    try {
        const { status } = req.query;
        const orders = await client_1.db.order.findMany({
            where: status ? { status: String(status) } : {},
            orderBy: { createdAt: "desc" }
        });
        res.json({ success: true, orders });
    }
    catch (err) {
        res.json({
            success: true,
            orders: []
        });
    }
});
exports.default = router;
