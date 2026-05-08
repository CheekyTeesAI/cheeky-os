"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listGarmentOrdersNeedingAttention = listGarmentOrdersNeedingAttention;
exports.buildGarmentOrdersPayload = buildGarmentOrdersPayload;
exports.markGarmentsOrdered = markGarmentsOrdered;
exports.markGarmentsReceived = markGarmentsReceived;
exports.getGarmentDigestSnapshot = getGarmentDigestSnapshot;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const orderEvaluator_1 = require("./orderEvaluator");
const garmentOrderFlowService_1 = require("./garmentOrderFlowService");
const MS_DAY = 86400000;
function isOrderedLike(s) {
    const u = String(s ?? "").toUpperCase();
    return (u === garmentOrderFlowService_1.GarmentOrderStatus.ORDERED ||
        u === "SUBMITTED" ||
        u === "CONFIRMED");
}
function isPendingLike(s) {
    const u = String(s ?? "").toUpperCase();
    return (u === garmentOrderFlowService_1.GarmentOrderStatus.ORDER_PENDING ||
        u === garmentOrderFlowService_1.GarmentOrderStatus.NEEDED ||
        u === "");
}
function priorityScore(row) {
    const st = String(row.garmentOrderStatus ?? "").toUpperCase();
    if (isPendingLike(st))
        return 0;
    if (isOrderedLike(st)) {
        const placed = row.garmentOrderPlacedAt?.getTime() ?? 0;
        const days = placed ? (Date.now() - placed) / MS_DAY : 99;
        return days >= 5 ? 1 : 2;
    }
    return 5;
}
/**
 * Orders that need garment ordering attention (PostgreSQL Order + Task).
 */
async function listGarmentOrdersNeedingAttention() {
    const rows = await client_2.db.order.findMany({
        where: {
            deletedAt: null,
            jobCreated: true,
            AND: [
                {
                    OR: [
                        { depositStatus: client_1.OrderDepositStatus.PAID },
                        { depositReceived: true },
                    ],
                },
                {
                    status: {
                        in: [
                            "PRODUCTION_READY",
                            "PAID_IN_FULL",
                            "DEPOSIT_PAID",
                            "PRINTING",
                        ],
                    },
                },
                {
                    garmentOrderNeeded: true,
                },
                {
                    OR: [
                        { garmentOrderStatus: null },
                        {
                            garmentOrderStatus: {
                                notIn: [
                                    garmentOrderFlowService_1.GarmentOrderStatus.NOT_NEEDED,
                                    garmentOrderFlowService_1.GarmentOrderStatus.RECEIVED,
                                ],
                            },
                        },
                    ],
                },
            ],
        },
        include: {
            tasks: {
                where: {
                    OR: [{ type: "GARMENT_ORDER" }, { type: "ORDER_GARMENTS" }],
                },
                take: 1,
                orderBy: { createdAt: "asc" },
            },
        },
        take: 150,
        orderBy: { updatedAt: "desc" },
    });
    const now = Date.now();
    const out = [];
    for (const o of rows) {
        const st = String(o.garmentOrderStatus ?? "").toUpperCase();
        if (st === "FAILED")
            continue;
        const t = o.tasks[0];
        const daysSinceActivity = Math.max(0, Math.floor((now - o.updatedAt.getTime()) / MS_DAY));
        out.push({
            orderId: o.id,
            customerName: String(o.customerName || "").trim() || "Unknown",
            garmentOrderStatus: o.garmentOrderStatus || "",
            taskId: t?.id ?? null,
            title: t?.title ?? null,
            dueDate: t?.dueDate ? t.dueDate.toISOString() : null,
            stage: String(o.status),
            priority: priorityScore(o),
            daysSinceActivity,
        });
    }
    out.sort((a, b) => a.priority - b.priority || a.customerName.localeCompare(b.customerName));
    return out;
}
async function buildGarmentOrdersPayload() {
    const items = await listGarmentOrdersNeedingAttention();
    const pending = items.filter((i) => isPendingLike(i.garmentOrderStatus));
    const ordered = items.filter((i) => isOrderedLike(i.garmentOrderStatus));
    const stalePending = pending.filter((i) => i.daysSinceActivity >= 1);
    let spoken = `You have ${items.length} garment order${items.length === 1 ? "" : "s"} needing attention.`;
    if (pending.length > 0) {
        spoken += ` ${pending.length} still pending placement.`;
    }
    if (stalePending.length > 0) {
        spoken += ` ${stalePending.length} pending over one day.`;
    }
    if (ordered.length > 0) {
        spoken += ` ${ordered.length} ordered, awaiting receive.`;
    }
    const publicItems = items.map(({ priority: _p, ...rest }) => rest);
    return {
        success: true,
        count: items.length,
        items: publicItems,
        spokenSummary: spoken,
    };
}
async function markGarmentsOrdered(orderId) {
    const id = String(orderId ?? "").trim();
    const existing = await client_2.db.order.findUnique({ where: { id } });
    if (!existing) {
        throw new orderEvaluator_1.OrderNotFoundError(id);
    }
    const now = new Date();
    await client_2.db.order.update({
        where: { id },
        data: {
            garmentOrderStatus: garmentOrderFlowService_1.GarmentOrderStatus.ORDERED,
            garmentOrderPlacedAt: now,
        },
    });
    await client_2.db.task.updateMany({
        where: {
            orderId: id,
            OR: [{ type: "GARMENT_ORDER" }, { type: "ORDER_GARMENTS" }],
        },
        data: { status: "DONE" },
    });
    return {
        success: true,
        orderId: id,
        garmentOrderStatus: garmentOrderFlowService_1.GarmentOrderStatus.ORDERED,
        garmentOrderPlacedAt: now.toISOString(),
    };
}
async function markGarmentsReceived(orderId) {
    const id = String(orderId ?? "").trim();
    const existing = await client_2.db.order.findUnique({ where: { id } });
    if (!existing) {
        throw new orderEvaluator_1.OrderNotFoundError(id);
    }
    const now = new Date();
    await client_2.db.order.update({
        where: { id },
        data: {
            garmentOrderStatus: garmentOrderFlowService_1.GarmentOrderStatus.RECEIVED,
            garmentOrderReceivedAt: now,
        },
    });
    return {
        success: true,
        orderId: id,
        garmentOrderStatus: garmentOrderFlowService_1.GarmentOrderStatus.RECEIVED,
        garmentOrderReceivedAt: now.toISOString(),
    };
}
async function getGarmentDigestSnapshot() {
    const items = await listGarmentOrdersNeedingAttention();
    const pending = items.filter((i) => isPendingLike(i.garmentOrderStatus)).length;
    const ordered = items.filter((i) => isOrderedLike(i.garmentOrderStatus)).length;
    const missingTask = await client_2.db.order.count({
        where: {
            deletedAt: null,
            jobCreated: true,
            garmentOrderNeeded: true,
            garmentOrderStatus: garmentOrderFlowService_1.GarmentOrderStatus.ORDER_PENDING,
            NOT: {
                tasks: {
                    some: {
                        type: { in: ["GARMENT_ORDER", "ORDER_GARMENTS"] },
                    },
                },
            },
        },
    });
    return {
        garmentOrdersPending: pending,
        garmentOrdersOrderedAwaitingReceive: ordered,
        productionReadyMissingGarmentTask: missingTask,
    };
}
