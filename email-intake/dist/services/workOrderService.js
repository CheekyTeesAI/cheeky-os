"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORK_ORDER_STATUS = void 0;
exports.isWorkOrderReady = isWorkOrderReady;
exports.buildWorkOrderPacket = buildWorkOrderPacket;
exports.loadOrderForWorkOrder = loadOrderForWorkOrder;
exports.generateWorkOrder = generateWorkOrder;
exports.markWorkOrderPrinted = markWorkOrderPrinted;
exports.listWorkOrdersReady = listWorkOrdersReady;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const logger_1 = require("../utils/logger");
exports.WORK_ORDER_STATUS = {
    NOT_CREATED: "NOT_CREATED",
    GENERATED: "GENERATED",
    PRINTED: "PRINTED",
};
const orderInclude = {
    lineItems: true,
    tasks: { orderBy: { createdAt: "asc" } },
};
function normWoStatus(s) {
    const u = String(s || "").toUpperCase();
    if (u === "GENERATED" || u === "PRINTED")
        return u;
    return exports.WORK_ORDER_STATUS.NOT_CREATED;
}
/**
 * Gates align with productionPrintGate + garment comms heuristics.
 */
function isWorkOrderReady(order) {
    const blockers = [];
    if (order.deletedAt) {
        blockers.push("Order deleted");
    }
    if (order.status === "CANCELLED") {
        blockers.push("Order cancelled");
    }
    if (order.depositStatus !== client_1.OrderDepositStatus.PAID) {
        blockers.push("Deposit not paid");
    }
    if (order.proofRequired === true) {
        const p = String(order.proofStatus ?? "").toUpperCase();
        if (p !== "APPROVED") {
            blockers.push("Proof not approved");
        }
    }
    const art = String(order.artFileStatus ?? "").toUpperCase();
    if (art !== "READY" && art !== "APPROVED") {
        blockers.push("Art not ready");
    }
    if (order.garmentOrderNeeded === true) {
        const g = String(order.garmentOrderStatus ?? "").toUpperCase();
        if (g !== "NOT_NEEDED" && g !== "RECEIVED") {
            blockers.push("Garments not received");
        }
    }
    return { ready: blockers.length === 0, blockers };
}
function defaultWorkOrderNumber(order) {
    const base = order.orderNumber?.trim() || order.id.slice(0, 8).toUpperCase();
    return `WO-${base}`;
}
function buildWorkOrderPacket(order) {
    const { ready, blockers } = isWorkOrderReady(order);
    void ready;
    const lineItems = (order.lineItems ?? []).map((li) => ({
        name: li.description || "Line item",
        quantity: li.quantity,
        notes: li.productionType || null,
        color: null,
        sizes: null,
        printLocations: li.productionType || null,
    }));
    if (lineItems.length === 0 && order.quantity != null && order.quantity > 0) {
        lineItems.push({
            name: order.garmentType || "Order total",
            quantity: order.quantity,
            notes: order.printMethod || null,
            color: null,
            sizes: null,
            printLocations: order.printMethod || null,
        });
    }
    const taskSummary = (order.tasks ?? []).map((t) => ({
        title: t.title,
        status: String(t.status),
        type: t.type ?? null,
    }));
    return {
        orderId: order.id,
        workOrderNumber: order.workOrderNumber ?? null,
        workOrderStatus: normWoStatus(order.workOrderStatus),
        customerName: order.customerName ?? null,
        customerEmail: order.email ?? null,
        stage: String(order.status),
        productionType: order.productionTypeFinal ||
            (order.lineItems?.[0]?.productionType != null
                ? String(order.lineItems[0].productionType)
                : null),
        dueDate: order.dueDate ? order.dueDate.toISOString() : null,
        depositStatus: String(order.depositStatus),
        proofStatus: order.proofStatus ?? null,
        artStatus: order.artFileStatus ?? null,
        garmentOrderStatus: order.garmentOrderStatus ?? null,
        lineItems,
        productionNotes: order.notes ?? null,
        artFileUrl: order.artFileUrl ?? null,
        mockupUrl: order.mockupUrl ?? null,
        proofFileUrl: order.proofFileUrl ?? null,
        taskSummary,
        blockers,
    };
}
async function loadOrderForWorkOrder(orderId) {
    return client_2.db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: orderInclude,
    });
}
async function generateWorkOrder(orderId) {
    const order = await loadOrderForWorkOrder(orderId);
    if (!order) {
        throw new Error("Order not found");
    }
    const gate = isWorkOrderReady(order);
    if (!gate.ready) {
        return { ok: false, blockers: gate.blockers };
    }
    const num = order.workOrderNumber?.trim() || defaultWorkOrderNumber(order);
    const updated = await client_2.db.order.update({
        where: { id: orderId },
        data: {
            workOrderStatus: exports.WORK_ORDER_STATUS.GENERATED,
            workOrderGeneratedAt: new Date(),
            workOrderNumber: num,
        },
        include: orderInclude,
    });
    const packet = buildWorkOrderPacket(updated);
    packet.workOrderNumber = num;
    packet.workOrderStatus = exports.WORK_ORDER_STATUS.GENERATED;
    logger_1.logger.info(`[workOrder] generated ${num} for order ${orderId}`);
    return { ok: true, packet, workOrderNumber: num };
}
async function markWorkOrderPrinted(orderId) {
    await client_2.db.order.update({
        where: { id: orderId },
        data: { workOrderStatus: exports.WORK_ORDER_STATUS.PRINTED },
    });
}
async function listWorkOrdersReady(limit = 80) {
    const orders = await client_2.db.order.findMany({
        where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
            id: true,
            customerName: true,
            workOrderStatus: true,
            workOrderNumber: true,
            depositStatus: true,
            proofRequired: true,
            proofStatus: true,
            artFileStatus: true,
            garmentOrderNeeded: true,
            garmentOrderStatus: true,
            deletedAt: true,
            status: true,
        },
    });
    return orders.map((o) => {
        const { ready, blockers } = isWorkOrderReady(o);
        return {
            orderId: o.id,
            customerName: o.customerName,
            ready,
            workOrderStatus: normWoStatus(o.workOrderStatus),
            workOrderNumber: o.workOrderNumber ?? null,
            blockers,
        };
    });
}
