"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSquarePaymentWebhook = handleSquarePaymentWebhook;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const paymentStateNormalizer_1 = require("../lib/paymentStateNormalizer");
const squareOrderStateSync_1 = require("../lib/squareOrderStateSync");
const taskGenerator_1 = require("./taskGenerator");
const proofRoutingService_1 = require("./proofRoutingService");
function asString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function readPayment(payload) {
    return payload?.data?.object?.payment ?? payload?.payment ?? null;
}
function readEventType(payload) {
    return (asString(payload?.type) ??
        asString(payload?.event_type) ??
        asString(payload?.eventType));
}
function amountToDollars(cents) {
    if (typeof cents !== "number" || !Number.isFinite(cents))
        return 0;
    return cents / 100;
}
async function handleSquarePaymentWebhook(payload) {
    const eventType = readEventType(payload);
    if (eventType !== "payment.completed") {
        return { ok: true, skipped: true };
    }
    const payment = readPayment(payload);
    const payRaw = typeof payment?.status === "string" ? payment.status.trim() : "";
    const normPay = (0, paymentStateNormalizer_1.normalizeSquarePaymentStatus)(payRaw || null);
    if (payRaw && normPay === "UNKNOWN") {
        console.warn(`[square-payment] payment_status_normalized_unknown raw=${payRaw.slice(0, 80)}`);
    }
    const squarePaymentId = asString(payment?.id);
    if (!squarePaymentId) {
        console.error("[squarePaymentHandler] payment.completed missing payment.id");
        return { ok: true, skipped: true };
    }
    const squareOrderId = asString(payment?.order_id);
    const email = asString(payment?.buyer_email_address);
    if (!email) {
        console.error("[squarePaymentHandler] payment.completed missing buyer email");
        return { ok: true, skipped: true };
    }
    const existingOrder = await client_2.db.order.findUnique({
        where: { squareId: squarePaymentId },
        select: { id: true },
    });
    if (existingOrder) {
        return { ok: true, duplicate: true };
    }
    const name = asString(payment?.buyer_name) ?? asString(payload?.customer?.name) ?? "Square Customer";
    const totalAmount = amountToDollars(payment?.amount_money?.amount);
    const moneySync = (0, squareOrderStateSync_1.buildPaymentCompletedMoneySyncView)({
        payload,
        eventType,
        rawPaymentStatus: payRaw || null,
        normPay,
        squarePaymentId,
        squareOrderId,
        totalAmountDollars: totalAmount,
    });
    console.log(`[square-payment] phase=money_sync ${(0, squareOrderStateSync_1.compactSyncLogLine)(moneySync)}`);
    const customer = await client_2.db.customer.upsert({
        where: { email },
        update: { name },
        create: { email, name },
        select: { id: true },
    });
    const orderData = {
        orderNumber: `CHK-${Date.now()}`,
        customerId: customer.id,
        squareId: squarePaymentId,
        squareOrderId,
        totalAmount,
        depositAmount: totalAmount,
        depositPaid: totalAmount,
        depositStatus: client_1.OrderDepositStatus.PAID,
        amountPaid: totalAmount,
        depositReceived: true,
        status: "PRODUCTION_READY",
        source: "SQUARE",
        proofRequired: true,
        proofStatus: proofRoutingService_1.PROOF_STATUS.NOT_SENT,
    };
    try {
        const createdOrder = await client_2.db.order.create({
            data: orderData,
        });
        await (0, taskGenerator_1.generateTasksForOrder)(createdOrder.id);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Unknown argument `source`")) {
            const { source: _source, ...withoutSource } = orderData;
            const createdOrder = await client_2.db.order.create({
                data: withoutSource,
            });
            await (0, taskGenerator_1.generateTasksForOrder)(createdOrder.id);
        }
        else {
            throw error;
        }
    }
    return { ok: true };
}
