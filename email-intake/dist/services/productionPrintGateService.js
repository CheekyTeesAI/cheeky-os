"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldBlockPrintTasksForOrder = shouldBlockPrintTasksForOrder;
exports.syncPrintTaskBlocksForOrder = syncPrintTaskBlocksForOrder;
const client_1 = require("../db/client");
/** Inline art gate (avoids circular imports with artRoutingService). */
function isArtReadyForPrinting(order) {
    const s = String(order.artFileStatus ?? "").toUpperCase();
    return s === "READY" || s === "APPROVED";
}
/**
 * When true, print-method tasks should stay BLOCKED until gates clear.
 */
function shouldBlockPrintTasksForOrder(order) {
    if (!isArtReadyForPrinting(order))
        return true;
    if (order.proofRequired === true) {
        const p = String(order.proofStatus ?? "").toUpperCase();
        if (p !== "APPROVED")
            return true;
    }
    return false;
}
function printTaskWhere(orderId, blocked) {
    const orClause = [
        { title: { startsWith: "Print " } },
        { title: "Burn Screen" },
        { title: { startsWith: "Press " } },
    ];
    if (blocked) {
        return {
            orderId,
            status: { not: "DONE" },
            OR: orClause,
        };
    }
    return {
        orderId,
        status: "BLOCKED",
        OR: orClause,
    };
}
/**
 * Reconcile print-step task BLOCKED state vs art + proof gates.
 */
async function syncPrintTaskBlocksForOrder(orderId) {
    const order = await client_1.db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { lineItems: { select: { description: true, productionType: true } } },
    });
    if (!order)
        return;
    const block = shouldBlockPrintTasksForOrder(order);
    if (block) {
        await client_1.db.task.updateMany({
            where: printTaskWhere(orderId, true),
            data: { status: "BLOCKED" },
        });
    }
    else {
        await client_1.db.task.updateMany({
            where: printTaskWhere(orderId, false),
            data: { status: "PENDING" },
        });
    }
}
