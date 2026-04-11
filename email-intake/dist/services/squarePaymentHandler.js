"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSquarePaymentWebhook = handleSquarePaymentWebhook;
const client_1 = require("../db/client");
const taskGenerator_1 = require("./taskGenerator");
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
    const existingOrder = await client_1.db.order.findUnique({
        where: { squarePaymentId },
        select: { id: true },
    });
    if (existingOrder) {
        return { ok: true, duplicate: true };
    }
    const name = asString(payment?.buyer_name) ?? asString(payload?.customer?.name) ?? "Square Customer";
    const totalAmount = amountToDollars(payment?.amount_money?.amount);
    const customer = await client_1.db.customer.upsert({
        where: { email },
        update: { name },
        create: { email, name },
        select: { id: true },
    });
    const orderData = {
        orderNumber: `CHK-${Date.now()}`,
        customerId: customer.id,
        squarePaymentId,
        squareOrderId,
        totalAmount,
        depositAmount: totalAmount,
        status: "PAID",
        source: "SQUARE",
    };
    try {
        const createdOrder = await client_1.db.order.create({
            data: orderData,
        });
        await (0, taskGenerator_1.generateTasksForOrder)(createdOrder.id);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Unknown argument `source`")) {
            const { source: _source, ...withoutSource } = orderData;
            const createdOrder = await client_1.db.order.create({
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
