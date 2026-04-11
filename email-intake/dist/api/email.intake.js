"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailIntake = emailIntake;
const orders_create_1 = require("./orders.create");
async function emailIntake(req, res) {
    try {
        const { subject, from, text } = req.body;
        if (!text && !subject) {
            return res.status(400).json({
                success: false,
                error: "Empty email"
            });
        }
        // VERY SIMPLE PARSING (safe)
        const customerName = from || "Email Customer";
        const email = from || "";
        const items = [subject || "Custom Order Request"];
        const notes = text || "";
        const mockReq = {
            body: {
                customerName,
                email,
                items,
                notes
            }
        };
        const mockRes = {
            json: () => { },
            status: () => ({ json: () => { } })
        };
        await (0, orders_create_1.createOrder)(mockReq, mockRes);
        console.log("Order created from email");
        return res.json({ success: true });
    }
    catch (err) {
        console.error("Email intake failed", err);
        return res.status(500).json({
            success: false,
            error: "Email intake failed"
        });
    }
}
