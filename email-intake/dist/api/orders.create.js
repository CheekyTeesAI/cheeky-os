"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
async function createOrder(req, res) {
    try {
        const { customerName, email, items, notes } = req.body;
        // Minimal validation
        if (!customerName || !items) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }
        // TEMP: no DB write yet (safe mode)
        const order = {
            id: "temp_" + Date.now(),
            customerName,
            email,
            items,
            notes,
            status: "NEW",
            createdAt: new Date().toISOString()
        };
        return res.json({
            success: true,
            order
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: "Order creation failed"
        });
    }
}
