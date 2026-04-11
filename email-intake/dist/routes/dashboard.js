"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
function startOfTodayLocal() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}
router.get("/dashboard/orders", async (_req, res) => {
    try {
        const orders = await client_1.db.order.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                status: true,
                source: true,
                totalAmount: true,
                depositAmount: true,
                createdAt: true,
                customer: { select: { name: true, email: true } },
                _count: { select: { tasks: true } },
            },
        });
        res.json(orders);
    }
    catch (error) {
        console.error("[dashboard/orders] Failed", error);
        res.status(500).json([]);
    }
});
router.get("/dashboard/orders/today", async (_req, res) => {
    try {
        const today = startOfTodayLocal();
        const orders = await client_1.db.order.findMany({
            where: { createdAt: { gte: today } },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                status: true,
                source: true,
                totalAmount: true,
                depositAmount: true,
                createdAt: true,
                customer: { select: { name: true, email: true } },
                _count: { select: { tasks: true } },
            },
        });
        res.json(orders);
    }
    catch (error) {
        console.error("[dashboard/orders/today] Failed", error);
        res.status(500).json([]);
    }
});
router.get("/dashboard/tasks/pending", async (_req, res) => {
    try {
        const tasks = await client_1.db.task.findMany({
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                order: {
                    select: {
                        id: true,
                        status: true,
                        customer: { select: { name: true } },
                    },
                },
            },
        });
        res.json(tasks);
    }
    catch (error) {
        console.error("[dashboard/tasks/pending] Failed", error);
        res.status(500).json([]);
    }
});
router.get("/dashboard/summary", async (_req, res) => {
    try {
        const today = startOfTodayLocal();
        const [ordersToday, pendingTasks, unpaidOrders] = await Promise.all([
            client_1.db.order.count({ where: { createdAt: { gte: today } } }),
            client_1.db.task.count({ where: { status: "PENDING" } }),
            client_1.db.order.findMany({
                where: { status: { not: "PAID" } },
                select: { totalAmount: true, depositAmount: true },
            }),
        ]);
        const unpaidBalance = unpaidOrders.reduce((sum, order) => {
            const total = Number(order?.totalAmount ?? 0);
            const deposit = Number(order?.depositAmount ?? 0);
            return sum + (Number.isFinite(total) ? total : 0) - (Number.isFinite(deposit) ? deposit : 0);
        }, 0);
        let lateOrders = 0;
        try {
            lateOrders = await client_1.db.order.count({
                where: {
                    dueDate: { lt: new Date() },
                    status: { notIn: ["DONE", "CANCELLED"] },
                },
            });
        }
        catch {
            lateOrders = 0;
        }
        res.json({
            ordersToday,
            pendingTasks,
            unpaidBalance,
            lateOrders,
        });
    }
    catch (error) {
        console.error("[dashboard/summary] Failed", error);
        res.status(500).json({
            ordersToday: 0,
            pendingTasks: 0,
            unpaidBalance: 0,
            lateOrders: 0,
        });
    }
});
exports.default = router;
