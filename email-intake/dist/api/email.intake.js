"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailIntake = emailIntake;
const intakeNormalizer_1 = require("../lib/intakeNormalizer");
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
        const normalized = (0, intakeNormalizer_1.normalizeEmailIntake)(req.body);
        const pipelineBody = (0, intakeNormalizer_1.toCreateOrderPipelineBody)(normalized);
        const mockReq = {
            body: pipelineBody,
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
