"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.get("/cheeky/orders", async (req, res) => {
    try {
        const rawStatus = String(req.query.status || "").trim();
        const status = rawStatus.length > 0 ? rawStatus : null;
        const orders = await client_1.db.order.findMany({
            where: status ? { status } : {},
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
