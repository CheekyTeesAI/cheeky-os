"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.post("/cheeky/orders/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await client_1.db.order.update({
            where: { id },
            data: { status }
        });
        res.json({ success: true, order: updated });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Failed to update order status"
        });
    }
});
exports.default = router;
