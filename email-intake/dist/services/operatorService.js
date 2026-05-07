"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyPrintQueue = getDailyPrintQueue;
exports.getFollowUpPriority = getFollowUpPriority;
exports.getHotUnpaidOrders = getHotUnpaidOrders;
exports.getOrdersCreatedToday = getOrdersCreatedToday;
exports.getNextBestActions = getNextBestActions;
exports.getOperatorBriefing = getOperatorBriefing;
const client_1 = require("../db/client");
const estimateSendService_1 = require("./estimateSendService");
const paymentCloseEngine_1 = require("./paymentCloseEngine");
function inferSource(order) {
    if (order.squareId || order.squareOrderId)
        return "SQUARE";
    return "EMAIL";
}
function startOfTodayLocal() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}
const MS_24H = 24 * 60 * 60 * 1000;
async function getDailyPrintQueue() {
    try {
        const tasks = await client_1.db.task.findMany({
            where: { status: "PENDING" },
            include: {
                order: {
                    include: {
                        customer: true,
                        lineItems: true,
                    },
                },
            },
        });
        const byOrder = new Map();
        for (const t of tasks) {
            const o = t.order;
            if (!o || o.deletedAt)
                continue;
            const cur = byOrder.get(o.id);
            const title = t.title?.trim() || "Task";
            if (cur) {
                cur.titles.push(title);
            }
            else {
                byOrder.set(o.id, { order: o, titles: [title] });
            }
        }
        const rows = [];
        for (const { order: o, titles } of byOrder.values()) {
            const cust = o.customer;
            rows.push({
                orderId: o.id,
                orderStatus: String(o.status),
                customerName: cust?.name ?? null,
                customerEmail: cust?.email ?? null,
                taskTitles: titles,
                lineItemCount: o.lineItems?.length ?? 0,
                createdAt: o.createdAt.toISOString(),
            });
        }
        rows.sort((a, b) => {
            const ap = String(a.orderStatus).toUpperCase() === "PAID" ? 1 : 0;
            const bp = String(b.orderStatus).toUpperCase() === "PAID" ? 1 : 0;
            if (bp !== ap)
                return bp - ap;
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            if (ta !== tb)
                return ta - tb;
            return b.lineItemCount - a.lineItemCount;
        });
        return rows;
    }
    catch {
        return [];
    }
}
function recommendedFollowUp(orderId, status, lineItemCount) {
    const st = status.toUpperCase();
    if (st === "NEEDS_REVIEW")
        return "REVIEW_ORDER";
    if (st === "QUOTE") {
        if (!(0, estimateSendService_1.hasEstimateBeenDraftedForOrder)(orderId) && lineItemCount > 0) {
            return "SEND_ESTIMATE";
        }
        return "FOLLOW_UP";
    }
    return "FOLLOW_UP";
}
async function getFollowUpPriority() {
    try {
        const rows = await client_1.db.order.findMany({
            where: { deletedAt: null },
            include: { customer: true, lineItems: true },
        });
        const filtered = rows.filter((o) => ["QUOTE", "NEEDS_REVIEW"].includes(String(o.status)));
        const out = [];
        const now = Date.now();
        for (const o of filtered) {
            const email = o.customer?.email?.trim() ?? "";
            if (!email)
                continue;
            const ageMs = now - o.createdAt.getTime();
            const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;
            const lineItemCount = o.lineItems?.length ?? 0;
            out.push({
                orderId: o.id,
                status: String(o.status),
                customerName: o.customer?.name ?? null,
                customerEmail: email,
                ageHours,
                lineItemCount,
                recommendedAction: recommendedFollowUp(o.id, String(o.status), lineItemCount),
            });
        }
        out.sort((a, b) => {
            const aOld = a.ageHours >= 2 ? 1 : 0;
            const bOld = b.ageHours >= 2 ? 1 : 0;
            if (bOld !== aOld)
                return bOld - aOld;
            const li = b.lineItemCount - a.lineItemCount;
            if (li !== 0)
                return li;
            return b.ageHours - a.ageHours;
        });
        return out;
    }
    catch {
        return [];
    }
}
async function getHotUnpaidOrders() {
    try {
        const rows = await client_1.db.order.findMany({
            where: { deletedAt: null },
            include: {
                customer: true,
                lineItems: true,
                tasks: true,
            },
        });
        const eligible = rows.filter((o) => (0, paymentCloseEngine_1.isEligibleUnpaidQuote)(o));
        const scored = eligible.map((o) => ({
            order: o,
            score: (0, paymentCloseEngine_1.scoreOrderForClosing)(o),
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 15).map(({ order: o, score }) => ({
            orderId: o.id,
            customerName: o.customer?.name ?? null,
            customerEmail: o.customer?.email ?? null,
            totalAmount: o.totalAmount,
            depositAmount: o.depositAmount,
            score,
            createdAt: o.createdAt.toISOString(),
        }));
    }
    catch {
        return [];
    }
}
async function getOrdersCreatedToday() {
    try {
        const start = startOfTodayLocal();
        const rows = await client_1.db.order.findMany({
            where: { deletedAt: null, createdAt: { gte: start } },
            orderBy: { createdAt: "desc" },
            include: { customer: true },
        });
        return rows.map((o) => ({
            orderId: o.id,
            status: String(o.status),
            source: inferSource(o),
            customerName: o.customer?.name ?? null,
            customerEmail: o.customer?.email ?? null,
            totalAmount: o.totalAmount,
            createdAt: o.createdAt.toISOString(),
        }));
    }
    catch {
        return [];
    }
}
async function getNextBestActions() {
    try {
        const actions = [];
        const orderSeen = new Set();
        const all = await client_1.db.order.findMany({
            where: { deletedAt: null },
            include: { customer: true, lineItems: true, tasks: true },
        });
        const push = (a) => {
            if (actions.length >= 10)
                return;
            if (orderSeen.has(a.orderId))
                return;
            orderSeen.add(a.orderId);
            actions.push(a);
        };
        const needsReview = all
            .filter((o) => String(o.status).toUpperCase() === "NEEDS_REVIEW")
            .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
        for (const o of needsReview) {
            push({
                type: "REVIEW_INTAKE",
                orderId: o.id,
                priority: "HIGH",
                reason: "Intake needs confirmation",
                customerName: o.customer?.name ?? null,
            });
        }
        const hotEligible = all
            .filter((o) => (0, paymentCloseEngine_1.isEligibleUnpaidQuote)(o))
            .map((o) => ({
            order: o,
            score: (0, paymentCloseEngine_1.scoreOrderForClosing)(o),
        }))
            .sort((a, b) => b.score - a.score);
        for (const { order: ord, score } of hotEligible) {
            if (actions.length >= 10)
                break;
            if (orderSeen.has(ord.id))
                continue;
            const lines = ord.lineItems?.length ?? 0;
            if (score >= 60 && lines > 0) {
                push({
                    type: "COLLECT_PAYMENT",
                    orderId: ord.id,
                    priority: "HIGH",
                    reason: "Hot unpaid — prioritize payment / close",
                    customerName: ord.customer?.name ?? null,
                });
                continue;
            }
            if (!(0, estimateSendService_1.hasEstimateBeenDraftedForOrder)(ord.id) && lines > 0) {
                push({
                    type: "SEND_ESTIMATE",
                    orderId: ord.id,
                    priority: "HIGH",
                    reason: "Unpaid quote — send estimate",
                    customerName: ord.customer?.name ?? null,
                });
            }
            else {
                push({
                    type: "FOLLOW_UP_QUOTE",
                    orderId: ord.id,
                    priority: "MEDIUM",
                    reason: "Unpaid quote — follow up",
                    customerName: ord.customer?.name ?? null,
                });
            }
        }
        const paidPending = all.filter((o) => {
            if (String(o.status).toUpperCase() !== "PAID")
                return false;
            return (o.tasks ?? []).some((t) => t.status === "PENDING");
        });
        paidPending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const o of paidPending) {
            push({
                type: "START_PRINTING",
                orderId: o.id,
                priority: "MEDIUM",
                reason: "Paid order with pending tasks",
                customerName: o.customer?.name ?? null,
            });
        }
        const staleQuotes = all.filter((o) => {
            if (String(o.status).toUpperCase() !== "QUOTE")
                return false;
            return Date.now() - o.createdAt.getTime() > MS_24H;
        });
        staleQuotes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const o of staleQuotes) {
            push({
                type: "FOLLOW_UP_QUOTE",
                orderId: o.id,
                priority: "LOW",
                reason: "Stale quote (>24h)",
                customerName: o.customer?.name ?? null,
            });
        }
        return actions.slice(0, 10);
    }
    catch {
        return [];
    }
}
async function getOperatorBriefing() {
    const [printQueue, followUps, hotUnpaid, ordersToday, nextActions] = await Promise.all([
        getDailyPrintQueue(),
        getFollowUpPriority(),
        getHotUnpaidOrders(),
        getOrdersCreatedToday(),
        getNextBestActions(),
    ]);
    return {
        printQueue: printQueue.slice(0, 5),
        followUps: followUps.slice(0, 5),
        hotUnpaid: hotUnpaid.slice(0, 5),
        ordersToday: ordersToday.slice(0, 5),
        nextActions: nextActions.slice(0, 10),
    };
}
