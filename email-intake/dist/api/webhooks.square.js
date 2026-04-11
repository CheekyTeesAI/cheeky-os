"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
console.log("🪝 WEBHOOK FILE LOADED");
const express_1 = require("express");
const brain_1 = require("../core/brain");
const orders_create_1 = require("../api/orders.create");
const { parseSquareEvent } = require("../lib/event-truth");
const { logger } = require("../utils/logger");
const router = (0, express_1.Router)();
function logWebhookHit(req) {
    const proto = String(req.headers["x-forwarded-proto"] || "http");
    const host = String(req.headers.host || "localhost");
    const detectedUrl = `${proto}://${host}`;
    console.log("🔥🔥 WEBHOOK HIT 🔥🔥", new Date().toISOString());
    console.log("🌐 BASE URL:", detectedUrl);
}
router.get("/", (req, res) => {
    logWebhookHit(req);
    res.status(200).json({ received: true });
});
router.post("/", async (req, res) => {
    try {
        console.log("🔥 INSIDE POST ROUTE", {
            method: req.method,
            contentType: req.headers["content-type"]
        });
        const body = JSON.parse(req.body.toString());
        const event = parseSquareEvent(body);
        if (!event.valid) {
            return res.status(200).json({
                received: true,
                ignored: true
            });
        }
        if (event.type === "payment.created") {
            try {
                const payment = event.data?.object?.payment;
                if (!payment)
                    return;
                const orderPayload = {
                    body: {
                        customerName: payment?.buyer_email_address || "Square Customer",
                        email: payment?.buyer_email_address || "",
                        items: [`Payment $${payment.amount_money?.amount / 100}`],
                        notes: "Auto-created from Square"
                    }
                };
                // Mock req/res for reuse of createOrder
                const mockReq = orderPayload;
                const mockRes = {
                    json: () => { },
                    status: () => ({ json: () => { } })
                };
                await (0, orders_create_1.createOrder)(mockReq, mockRes);
                console.log("Order created from Square payment");
            }
            catch (err) {
                console.error("Square → Order failed", err);
            }
        }
        logger.info("Pipeline ready — awaiting Bundle 2 wiring", {
            paymentId: event.paymentId
        });
        const eventSummary = `Square payment completed | paymentId: ${event.paymentId} | invoiceId: no-invoice-id`;
        await (0, brain_1.brain)(eventSummary);
        return res.status(200).json({ received: true });
    }
    catch (err) {
        logger.error("Webhook handler error", { err });
        return res.status(200).json({
            received: true,
            error: "handler_failed"
        });
    }
});
exports.default = router;
