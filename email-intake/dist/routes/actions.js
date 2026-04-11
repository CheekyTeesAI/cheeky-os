"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const estimateSendService_1 = require("../services/estimateSendService");
const salesAgent_1 = require("../services/salesAgent");
const client_1 = require("../db/client");
const paymentCloseEngine_1 = require("../services/paymentCloseEngine");
const router = (0, express_1.Router)();
function inferSource(order) {
    if (order.squarePaymentId || order.squareOrderId)
        return "SQUARE";
    return "EMAIL";
}
router.post("/actions/orders/:orderId/send-estimate", async (req, res) => {
    try {
        const orderId = String(req.params.orderId ?? "").trim();
        if (!orderId) {
            res.status(200).json({ error: "missing orderId" });
            return;
        }
        const out = await (0, estimateSendService_1.sendEstimate)(orderId);
        res.status(200).json(out);
    }
    catch (err) {
        console.error("[actions/send-estimate]", err);
        res.status(200).json({
            error: err instanceof Error ? err.message : "failed",
            orderId: req.params.orderId,
        });
    }
});
router.post("/actions/orders/:orderId/sales-message", async (req, res) => {
    try {
        const orderId = String(req.params.orderId ?? "").trim();
        if (!orderId) {
            res.status(200).json({ error: "missing orderId" });
            return;
        }
        const r = await (0, salesAgent_1.generateSalesMessage)(orderId, req.body ?? {});
        res.status(200).json({
            subject: r.subject,
            body: r.body,
            messageType: r.messageType,
            skipped: r.skipped,
        });
    }
    catch (err) {
        console.error("[actions/sales-message]", err);
        res.status(200).json({
            error: err instanceof Error ? err.message : "failed",
            skipped: true,
        });
    }
});
router.post("/actions/orders/:orderId/run-sales-agent", async (req, res) => {
    try {
        const orderId = String(req.params.orderId ?? "").trim();
        if (!orderId) {
            res.status(200).json({ error: "missing orderId" });
            return;
        }
        const body = (req.body ?? {});
        const autoSend = body.autoSend !== false;
        const channel = body.channel === "email" ? "email" : "console";
        const r = await (0, salesAgent_1.runSalesAgentForOrder)(orderId, {
            autoSend,
            channel,
            reason: body.reason ?? "quote_followup",
            force: body.force === true,
        });
        res.status(200).json(r);
    }
    catch (err) {
        console.error("[actions/run-sales-agent]", err);
        res.status(200).json({
            error: err instanceof Error ? err.message : "failed",
            skipped: true,
        });
    }
});
router.get("/actions/sales/queue", async (_req, res) => {
    try {
        const rows = await client_1.db.order.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: {
                customer: { select: { name: true, email: true } },
                _count: { select: { lineItems: true, tasks: true } },
            },
        });
        const actionable = rows.filter((o) => ["QUOTE", "NEEDS_REVIEW"].includes(String(o.status)));
        res.status(200).json(actionable.map((o) => ({
            id: o.id,
            status: o.status,
            source: inferSource(o),
            customerName: o.customer?.name ?? null,
            customerEmail: o.customer?.email ?? null,
            createdAt: o.createdAt,
            lineItemCount: o._count.lineItems,
            taskCount: o._count.tasks,
        })));
    }
    catch (err) {
        console.error("[actions/sales/queue]", err);
        res.status(200).json([]);
    }
});
router.post("/actions/payments/run-close", async (_req, res) => {
    try {
        const out = await (0, paymentCloseEngine_1.runPaymentClose)();
        res.status(200).json(out);
    }
    catch (err) {
        console.error("[actions/payments/run-close]", err);
        res.status(200).json({
            processed: 0,
            nudged: 0,
            skipped: 0,
            topScores: [],
            error: err instanceof Error ? err.message : "failed",
        });
    }
});
router.get("/actions/payments/queue", async (_req, res) => {
    try {
        const rows = await client_1.db.order.findMany({
            where: { deletedAt: null },
            include: {
                customer: { select: { name: true, email: true } },
                lineItems: true,
                tasks: true,
            },
        });
        const eligible = rows.filter((o) => {
            if (String(o.status).toUpperCase() !== "QUOTE")
                return false;
            const dep = Number(o.depositAmount ?? 0);
            const tot = Number(o.totalAmount ?? 0);
            return dep < tot || dep === 0;
        });
        const scored = eligible
            .map((o) => ({
            orderId: o.id,
            score: (0, paymentCloseEngine_1.scoreOrderForClosing)(o),
            totalAmount: o.totalAmount,
            depositAmount: o.depositAmount,
            customerName: o.customer?.name ?? null,
            createdAt: o.createdAt,
        }))
            .sort((a, b) => b.score - a.score);
        res.status(200).json(scored);
    }
    catch (err) {
        console.error("[actions/payments/queue]", err);
        res.status(200).json([]);
    }
});
exports.default = router;
