"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getOrders, updateOrderStatus, updateOrderRouting, getOrderMetrics, } = require("../../lib/orderStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logEvent } = require("../../lib/eventStore");
const router = express_1.default.Router();
router.get("/", (_req, res) => {
    try {
        res.json({ success: true, orders: getOrders() });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.get("/metrics", (_req, res) => {
    try {
        const m = getOrderMetrics();
        res.json({ success: true, ...m });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/status", (req, res) => {
    try {
        const { id, status } = req.body;
        if (!id || !status) {
            return res.status(400).json({
                success: false,
                error: "missing id/status",
            });
        }
        const updated = updateOrderStatus(id, status);
        if (!updated) {
            return res.status(404).json({ success: false, error: "order not found" });
        }
        try {
            logEvent("order_status_updated", { orderId: id, status });
        }
        catch (_) { }
        res.json({ success: true, order: updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
router.post("/routing", (req, res) => {
    try {
        const { id, routing } = req.body;
        if (!id || !routing) {
            return res.status(400).json({
                success: false,
                error: "missing id/routing",
            });
        }
        const updated = updateOrderRouting(id, routing);
        if (!updated) {
            return res.status(404).json({ success: false, error: "order not found" });
        }
        try {
            logEvent("order_routing_updated", { orderId: id, routing });
        }
        catch (_) { }
        res.json({ success: true, order: updated });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
});
exports.default = router;
