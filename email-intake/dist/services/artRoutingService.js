"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ART_STATUS = void 0;
exports.orderHasGraphicSignal = orderHasGraphicSignal;
exports.isArtReady = isArtReady;
exports.ensureArtPrepTask = ensureArtPrepTask;
exports.sendToPeter = sendToPeter;
exports.sendOrderToDigitizer = sendOrderToDigitizer;
exports.markArtReady = markArtReady;
exports.listOrdersNeedingArt = listOrdersNeedingArt;
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
const productionPrintGateService_1 = require("./productionPrintGateService");
/**
 * Art lifecycle for production gating — stored on `Order.artFileStatus`
 * (same values as mission `artStatus`; no extra column).
 */
exports.ART_STATUS = {
    NOT_READY: "NOT_READY",
    SENT_TO_DIGITIZER: "SENT_TO_DIGITIZER",
    READY: "READY",
    APPROVED: "APPROVED",
};
/** Coarse “has artwork reference” — line description/productionType or notes; no file inspection. */
function orderHasGraphicSignal(order) {
    const lines = order.lineItems ?? [];
    if (lines.some((li) => {
        const d = String(li.description ?? "").trim();
        const p = String(li.productionType ?? "").trim();
        return d.length > 0 || p.length > 0;
    })) {
        return true;
    }
    const n = String(order.notes ?? "");
    if (/\b(https?:\/\/[^\s]+|\.(png|jpg|jpeg|svg|pdf))\b/i.test(n)) {
        return true;
    }
    if (/\b(logo|graphic|artwork)\b/i.test(n))
        return true;
    return false;
}
/**
 * Art is ready for production when ops have marked READY/APPROVED.
 * (Graphic heuristics are advisory; approval is authoritative.)
 */
function isArtReady(order) {
    const s = String(order.artFileStatus ?? "").toUpperCase();
    const marked = s === exports.ART_STATUS.READY || s === exports.ART_STATUS.APPROVED;
    if (!marked)
        return false;
    return marked && (orderHasGraphicSignal(order) || marked);
}
/**
 * When art is not READY/APPROVED, ensure a single ART_PREP task exists (after job/deposit).
 */
async function ensureArtPrepTask(orderId) {
    const order = await client_1.db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            tasks: { select: { type: true } },
            lineItems: { select: { description: true, productionType: true } },
        },
    });
    if (!order)
        return { ok: false };
    if (isArtReady(order))
        return { ok: true, skipped: true };
    const hasPrep = order.tasks.some((t) => t.type === "ART_PREP");
    if (hasPrep)
        return { ok: true, skipped: true };
    const job = await client_1.db.job.findUnique({ where: { orderId } });
    if (!job)
        return { ok: true, skipped: true };
    const label = order.orderNumber ?? orderId.slice(0, 8);
    await client_1.db.task.create({
        data: {
            orderId,
            jobId: job.id,
            title: `Prepare artwork for Order #${label}`,
            type: "ART_PREP",
            /** Queued for staff — mission “READY” ≈ open in queue */
            status: "PENDING",
        },
    });
    return { ok: true, created: true };
}
function sendToPeter(order) {
    const num = order.orderNumber ?? order.id.slice(0, 8);
    const subject = `Art Request - Order #${num}`;
    const body = [
        `Customer: ${order.customerName ?? "—"}`,
        `Item: ${order.garmentType ?? order.printMethod ?? "—"}`,
        `Notes: ${order.notes ?? "—"}`,
        "",
        "Request: PNG, transparent background",
    ].join("\n");
    logger_1.logger.info(`[sendToPeter] ${subject}\n${body}`);
}
async function sendOrderToDigitizer(orderId) {
    const order = await client_1.db.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) {
        throw new Error("Order not found");
    }
    await client_1.db.order.update({
        where: { id: orderId },
        data: { artFileStatus: exports.ART_STATUS.SENT_TO_DIGITIZER },
    });
    const fresh = await client_1.db.order.findUniqueOrThrow({ where: { id: orderId } });
    logger_1.logger.info(`[art] send_to_digitizer orderId=${orderId} artFileStatus=${exports.ART_STATUS.SENT_TO_DIGITIZER}`);
    sendToPeter(fresh);
    return { success: true, orderId };
}
async function markArtReady(orderId) {
    const n = await client_1.db.order.updateMany({
        where: { id: orderId, deletedAt: null },
        data: { artFileStatus: exports.ART_STATUS.READY },
    });
    if (n.count === 0) {
        throw new Error("Order not found");
    }
    await (0, productionPrintGateService_1.syncPrintTaskBlocksForOrder)(orderId);
    return { success: true };
}
async function listOrdersNeedingArt() {
    const rows = await client_1.db.order.findMany({
        where: {
            deletedAt: null,
            OR: [
                {
                    artFileStatus: {
                        in: [exports.ART_STATUS.NOT_READY, exports.ART_STATUS.SENT_TO_DIGITIZER],
                    },
                },
                { artFileStatus: null },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            customerName: true,
            artFileStatus: true,
            status: true,
            garmentType: true,
        },
        take: 50,
        orderBy: { updatedAt: "desc" },
    });
    return rows;
}
