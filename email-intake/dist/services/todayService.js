"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayActions = getTodayActions;
const client_1 = require("../db/client");
const priorityService_1 = require("./priorityService");
const BUCKET_LIMIT = 25;
const URGENT_CANDIDATE_LIMIT = 50;
/**
 * Lightweight “today” buckets: capped queries only, no table scans.
 */
async function getTodayActions() {
    try {
        const [printRows, openExceptions, manualOverrideOrders, urgentCandidates, blockedRows,] = await Promise.all([
            client_1.db.job.findMany({
                where: {
                    status: "PRODUCTION_READY",
                    order: { status: "PRODUCTION_READY" },
                },
                orderBy: { createdAt: "asc" },
                take: BUCKET_LIMIT,
                select: {
                    id: true,
                    orderId: true,
                    status: true,
                    productionType: true,
                    notes: true,
                    createdAt: true,
                    order: { select: { customerName: true, status: true } },
                },
            }),
            client_1.db.exceptionReview.findMany({
                where: { resolved: false },
                orderBy: { createdAt: "desc" },
                take: 15,
                select: {
                    id: true,
                    orderId: true,
                    jobId: true,
                    type: true,
                    severity: true,
                    message: true,
                    createdAt: true,
                },
            }),
            client_1.db.order.findMany({
                where: { manualOverride: true },
                orderBy: { manualOverrideAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    customerName: true,
                    status: true,
                    manualOverrideReason: true,
                    manualOverrideBy: true,
                    manualOverrideAt: true,
                },
            }),
            client_1.db.order.findMany({
                where: { status: { not: "PAID_IN_FULL" } },
                orderBy: { updatedAt: "desc" },
                take: URGENT_CANDIDATE_LIMIT,
                select: {
                    id: true,
                    customerName: true,
                    status: true,
                    quotedAmount: true,
                    total: true,
                    invoiceExpiresAt: true,
                    quoteExpiresAt: true,
                    isRush: true,
                    blockedReason: true,
                },
            }),
            client_1.db.order.findMany({
                where: {
                    status: { not: "PAID_IN_FULL" },
                    OR: [{ status: "BLOCKED" }, { blockedReason: { not: null } }],
                },
                orderBy: { updatedAt: "desc" },
                take: BUCKET_LIMIT,
                select: {
                    id: true,
                    customerName: true,
                    status: true,
                    blockedReason: true,
                    quotedAmount: true,
                    createdAt: true,
                },
            }),
        ]);
        const printQueue = printRows.map((j) => ({
            jobId: j.id,
            orderId: j.orderId,
            customerName: j.order.customerName,
            orderStatus: j.order.status,
            jobStatus: j.status,
            productionType: j.productionType,
            notes: j.notes,
            createdAt: j.createdAt,
        }));
        const needsReview = [
            ...openExceptions.map((e) => ({
                kind: "exception",
                id: e.id,
                orderId: e.orderId,
                jobId: e.jobId,
                type: e.type,
                severity: e.severity,
                message: e.message,
                createdAt: e.createdAt,
            })),
            ...manualOverrideOrders.map((o) => ({
                kind: "manual_override",
                orderId: o.id,
                customerName: o.customerName,
                status: o.status,
                reason: o.manualOverrideReason ?? null,
                overriddenBy: o.manualOverrideBy ?? null,
                manualOverrideAt: o.manualOverrideAt ?? null,
            })),
        ].slice(0, BUCKET_LIMIT);
        const urgentOrders = urgentCandidates
            .map((o) => {
            const { priorityScore, priorityLevel } = (0, priorityService_1.calculateOrderPriority)({
                dueDate: o.invoiceExpiresAt ?? o.quoteExpiresAt,
                total: o.total,
                quotedAmount: o.quotedAmount,
                status: o.status,
                isRush: o.isRush,
                blockedReason: o.blockedReason,
            });
            return {
                orderId: o.id,
                customerName: o.customerName,
                status: o.status,
                priorityScore,
                priorityLevel,
                invoiceExpiresAt: o.invoiceExpiresAt,
                quoteExpiresAt: o.quoteExpiresAt,
            };
        })
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, BUCKET_LIMIT);
        const blockedOrders = blockedRows
            .filter((o) => o.status === "BLOCKED" ||
            (typeof o.blockedReason === "string" && o.blockedReason.trim().length > 0))
            .slice(0, BUCKET_LIMIT)
            .map((o) => ({
            orderId: o.id,
            customerName: o.customerName,
            status: o.status,
            blockedReason: o.blockedReason ?? null,
            quotedAmount: o.quotedAmount,
            createdAt: o.createdAt,
        }));
        return {
            printQueue,
            needsReview,
            urgentOrders,
            blockedOrders,
        };
    }
    catch (err) {
        console.error("[todayService] getTodayActions failed; returning empty buckets.", err instanceof Error ? err.message : err);
        return {
            printQueue: [],
            needsReview: [],
            urgentOrders: [],
            blockedOrders: [],
        };
    }
}
