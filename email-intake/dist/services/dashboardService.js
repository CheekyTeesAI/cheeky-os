"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayDashboard = getTodayDashboard;
const client_1 = require("../db/client");
const priorityService_1 = require("./priorityService");
const AWAITING_DEPOSIT_STATUSES = [
    "QUOTE_READY",
    "APPROVED",
    "INVOICE_DRAFTED",
];
function sumQuoted(rows) {
    return rows.reduce((s, r) => s + (r.quotedAmount ?? 0), 0);
}
async function getTodayDashboard() {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [awaitingDeposit, blockedOrders, productionReadyJobsRows, openTasks, paidInFullOrders, openExceptionsRecent, exceptionOpenCount, exceptionHighCount, exceptionBySeverity, overrideCount7d, overrideRecent, priorityOrdersSample,] = await Promise.all([
            client_1.db.order.findMany({
                where: { status: { in: [...AWAITING_DEPOSIT_STATUSES] } },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    customerName: true,
                    quotedAmount: true,
                    depositRequired: true,
                    squareInvoiceNumber: true,
                    createdAt: true,
                    status: true,
                },
            }),
            client_1.db.order.findMany({
                where: { status: "BLOCKED" },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    customerName: true,
                    blockedReason: true,
                    quotedAmount: true,
                    margin: true,
                    pph: true,
                    createdAt: true,
                },
            }),
            client_1.db.job.findMany({
                where: {
                    status: "PRODUCTION_READY",
                    order: { status: "PRODUCTION_READY" },
                },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    orderId: true,
                    productionType: true,
                    notes: true,
                    createdAt: true,
                    order: {
                        select: {
                            customerName: true,
                            quotedAmount: true,
                        },
                    },
                },
            }),
            client_1.db.task.findMany({
                where: { status: { not: "DONE" } },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    title: true,
                    type: true,
                    status: true,
                    assignedTo: true,
                    jobId: true,
                    createdAt: true,
                },
            }),
            client_1.db.order.findMany({
                where: { status: "PAID_IN_FULL" },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    customerName: true,
                    quotedAmount: true,
                    amountPaid: true,
                    finalPaidAt: true,
                },
            }),
            client_1.db.exceptionReview.findMany({
                where: { resolved: false },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    orderId: true,
                    jobId: true,
                    type: true,
                    source: true,
                    severity: true,
                    message: true,
                    createdAt: true,
                },
            }),
            client_1.db.exceptionReview.count({ where: { resolved: false } }),
            client_1.db.exceptionReview.count({
                where: {
                    resolved: false,
                    OR: [
                        { severity: { equals: "HIGH", mode: "insensitive" } },
                        { severity: { equals: "CRITICAL", mode: "insensitive" } },
                    ],
                },
            }),
            client_1.db.exceptionReview.groupBy({
                by: ["severity"],
                where: { resolved: false },
                _count: { _all: true },
            }),
            client_1.db.order.count({
                where: {
                    manualOverride: true,
                    manualOverrideAt: { gte: sevenDaysAgo },
                },
            }),
            client_1.db.order.findMany({
                where: {
                    manualOverride: true,
                    manualOverrideAt: { gte: sevenDaysAgo },
                },
                orderBy: { manualOverrideAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    manualOverrideBy: true,
                    manualOverrideReason: true,
                    manualOverrideAt: true,
                },
            }),
            client_1.db.order.findMany({
                where: { status: { not: "PAID_IN_FULL" } },
                orderBy: { updatedAt: "desc" },
                take: 50,
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
        ]);
        const productionReadyJobs = productionReadyJobsRows.map((j) => ({
            id: j.id,
            orderId: j.orderId,
            customerName: j.order.customerName,
            productionType: j.productionType,
            notes: j.notes,
            createdAt: j.createdAt,
        }));
        const totalProductionReadyRevenue = productionReadyJobsRows.reduce((s, j) => s + (j.order.quotedAmount ?? 0), 0);
        const bySeverity = {};
        for (const row of exceptionBySeverity) {
            bySeverity[row.severity] = row._count._all;
        }
        const prioritySummary = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
        };
        const scored = priorityOrdersSample.map((o) => {
            const { priorityScore, priorityLevel } = (0, priorityService_1.calculateOrderPriority)({
                dueDate: o.invoiceExpiresAt ?? o.quoteExpiresAt,
                total: o.total,
                quotedAmount: o.quotedAmount,
                status: o.status,
                isRush: o.isRush,
                blockedReason: o.blockedReason,
            });
            prioritySummary[priorityLevel] += 1;
            return {
                orderId: o.id,
                customerName: o.customerName,
                status: o.status,
                priorityScore,
                priorityLevel,
            };
        });
        const topCritical = scored
            .filter((r) => r.priorityLevel === "critical")
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, 5)
            .map((r) => ({
            orderId: r.orderId,
            customerName: r.customerName,
            status: r.status,
            priorityScore: r.priorityScore,
            priorityLevel: r.priorityLevel,
        }));
        return {
            success: true,
            exceptions: {
                openCount: exceptionOpenCount,
                highPriorityCount: exceptionHighCount,
                bySeverity,
                recent: openExceptionsRecent,
            },
            overrides: {
                count7d: overrideCount7d,
                recent: overrideRecent.map((o) => ({
                    orderId: o.id,
                    overriddenBy: o.manualOverrideBy ?? null,
                    reason: o.manualOverrideReason ?? null,
                    timestamp: o.manualOverrideAt ?? null,
                })),
            },
            dashboard: {
                summary: {
                    awaitingDepositCount: awaitingDeposit.length,
                    blockedOrdersCount: blockedOrders.length,
                    productionReadyJobsCount: productionReadyJobs.length,
                    openTasksCount: openTasks.length,
                    paidInFullOrdersCount: paidInFullOrders.length,
                    totalAwaitingDepositRevenue: sumQuoted(awaitingDeposit),
                    totalBlockedRevenue: sumQuoted(blockedOrders),
                    totalProductionReadyRevenue,
                },
                awaitingDeposit,
                blockedOrders,
                productionReadyJobs,
                openTasks,
                paidInFullOrders,
            },
            priority: {
                summary: prioritySummary,
                topCritical,
            },
        };
    }
    catch (err) {
        console.error("[dashboardService] getTodayDashboard failed; returning empty snapshot.", err instanceof Error ? err.message : err);
        return {
            success: true,
            exceptions: {
                openCount: 0,
                highPriorityCount: 0,
                bySeverity: {},
                recent: [],
            },
            overrides: { count7d: 0, recent: [] },
            dashboard: {
                summary: {
                    awaitingDepositCount: 0,
                    blockedOrdersCount: 0,
                    productionReadyJobsCount: 0,
                    openTasksCount: 0,
                    paidInFullOrdersCount: 0,
                    totalAwaitingDepositRevenue: 0,
                    totalBlockedRevenue: 0,
                    totalProductionReadyRevenue: 0,
                },
                awaitingDeposit: [],
                blockedOrders: [],
                productionReadyJobs: [],
                openTasks: [],
                paidInFullOrders: [],
            },
            priority: {
                summary: { low: 0, medium: 0, high: 0, critical: 0 },
                topCritical: [],
            },
        };
    }
}
