"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROOF_STATUS = void 0;
exports.sendProof = sendProof;
exports.ensureProofApprovalTask = ensureProofApprovalTask;
exports.sendProofForOrder = sendProofForOrder;
exports.approveProof = approveProof;
exports.rejectProof = rejectProof;
exports.listOrdersProofQueue = listOrdersProofQueue;
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
const productionPrintGateService_1 = require("./productionPrintGateService");
exports.PROOF_STATUS = {
    NOT_SENT: "NOT_SENT",
    SENT: "SENT",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
};
function sendProof(order) {
    const num = order.orderNumber ?? order.id.slice(0, 8);
    const subject = `Proof Approval - Order #${num}`;
    const summary = [
        order.garmentType && `Garment: ${order.garmentType}`,
        order.quantity != null && `Qty: ${order.quantity}`,
        order.printMethod && `Method: ${order.printMethod}`,
        order.notes && `Notes: ${order.notes}`,
    ]
        .filter(Boolean)
        .join(" · ");
    const body = [
        `Customer: ${order.customerName ?? "—"}`,
        `Summary: ${summary || "—"}`,
        "",
        "Please review the proof and reply to approve, or let us know if you need changes.",
    ].join("\n");
    logger_1.logger.info(`[sendProof] ${subject}\n${body}`);
}
async function ensureProofApprovalTask(orderId) {
    const order = await client_1.db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            tasks: { select: { type: true } },
        },
    });
    if (!order)
        return { ok: false };
    const o = order;
    if (o.proofRequired !== true)
        return { ok: true, skipped: true };
    const st = String(o.proofStatus ?? "").toUpperCase();
    if (st === exports.PROOF_STATUS.APPROVED)
        return { ok: true, skipped: true };
    const has = order.tasks.some((t) => t.type === "PROOF_APPROVAL");
    if (has)
        return { ok: true, skipped: true };
    const job = await client_1.db.job.findUnique({ where: { orderId } });
    if (!job)
        return { ok: true, skipped: true };
    const label = order.orderNumber ?? orderId.slice(0, 8);
    await client_1.db.task.create({
        data: {
            orderId,
            jobId: job.id,
            title: `Send proof for Order #${label}`,
            type: "PROOF_APPROVAL",
            status: "PENDING",
        },
    });
    return { ok: true, created: true };
}
async function sendProofForOrder(orderId) {
    const order = await client_1.db.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order)
        throw new Error("Order not found");
    const now = new Date();
    await client_1.db.order.update({
        where: { id: orderId },
        data: {
            proofStatus: exports.PROOF_STATUS.SENT,
            proofSentAt: now,
        },
    });
    logger_1.logger.info(`[proof] send orderId=${orderId} proofStatus=${exports.PROOF_STATUS.SENT}`);
    const fresh = await client_1.db.order.findUniqueOrThrow({ where: { id: orderId } });
    sendProof(fresh);
    await (0, productionPrintGateService_1.syncPrintTaskBlocksForOrder)(orderId);
    return { success: true, orderId };
}
async function approveProof(orderId) {
    const n = await client_1.db.order.updateMany({
        where: { id: orderId, deletedAt: null },
        data: {
            proofStatus: exports.PROOF_STATUS.APPROVED,
            proofApprovedAt: new Date(),
        },
    });
    if (n.count === 0)
        throw new Error("Order not found");
    await (0, productionPrintGateService_1.syncPrintTaskBlocksForOrder)(orderId);
    return { success: true };
}
async function rejectProof(orderId) {
    const n = await client_1.db.order.updateMany({
        where: { id: orderId, deletedAt: null },
        data: { proofStatus: exports.PROOF_STATUS.REJECTED },
    });
    if (n.count === 0)
        throw new Error("Order not found");
    await (0, productionPrintGateService_1.syncPrintTaskBlocksForOrder)(orderId);
    return { success: true };
}
async function listOrdersProofQueue() {
    const rows = await client_1.db.order.findMany({
        where: {
            deletedAt: null,
            proofRequired: true,
            proofStatus: {
                in: [exports.PROOF_STATUS.NOT_SENT, exports.PROOF_STATUS.SENT, exports.PROOF_STATUS.REJECTED],
            },
        },
        select: {
            id: true,
            orderNumber: true,
            customerName: true,
            proofStatus: true,
            proofRequired: true,
            status: true,
            garmentType: true,
            proofSentAt: true,
        },
        take: 50,
        orderBy: { updatedAt: "desc" },
    });
    return rows;
}
