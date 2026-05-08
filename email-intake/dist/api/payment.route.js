"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createOrderFromPayment } = require("../../lib/orderEngine");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { updateEstimateStatus } = require("../../lib/estimateStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logEvent } = require("../../lib/eventStore");
const router = express_1.default.Router();
router.post("/", (req, res) => {
    try {
        const body = (req.body || {});
        const customer = body.customer != null ? String(body.customer).trim() : "";
        if (!customer) {
            return res.status(400).json({
                success: false,
                error: "validation",
                message: "customer is required",
            });
        }
        if (body.depositPaid === undefined &&
            body.squarePaymentId === undefined &&
            body.totalAmount === undefined) {
            return res.status(400).json({
                success: false,
                error: "validation",
                message: "provide depositPaid, squarePaymentId, and/or totalAmount",
            });
        }
        const { order, tasks } = createOrderFromPayment(body);
        const estId = body.estimateId != null ? String(body.estimateId).trim() : "";
        if (estId) {
            updateEstimateStatus(estId, "paid");
            try {
                logEvent("estimate_converted_to_paid", {
                    estimateId: estId,
                    orderId: order && order.id,
                });
            }
            catch (_) { }
        }
        res.json({
            success: true,
            order,
            tasks,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[payment]", msg);
        res.status(500).json({
            success: false,
            error: "payment_flow_failed",
            message: msg,
        });
    }
});
exports.default = router;
