"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderNotEligibleForInvoiceError = void 0;
exports.createSquareDraftInvoiceForOrder = createSquareDraftInvoiceForOrder;
const client_1 = require("../db/client");
const squareClient_1 = require("../lib/squareClient");
const orderEvaluator_1 = require("./orderEvaluator");
function toDueDate(d) {
    return d.toISOString().slice(0, 10);
}
class OrderNotEligibleForInvoiceError extends Error {
    constructor(message) {
        super(message);
        this.name = "OrderNotEligibleForInvoiceError";
    }
}
exports.OrderNotEligibleForInvoiceError = OrderNotEligibleForInvoiceError;
async function createSquareDraftInvoiceForOrder(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        throw new orderEvaluator_1.OrderNotFoundError(orderId);
    }
    if (!order.isApproved) {
        throw new OrderNotEligibleForInvoiceError("Order must be approved (isApproved) before creating a Square draft invoice");
    }
    const status = String(order.status ?? "").toUpperCase();
    if (status !== "QUOTE_READY" && status !== "APPROVED") {
        throw new OrderNotEligibleForInvoiceError(`Order status must be QUOTE_READY or APPROVED (current: ${order.status})`);
    }
    const quoted = order.quotedAmount;
    if (quoted === null || quoted === undefined || quoted <= 0) {
        throw new OrderNotEligibleForInvoiceError("quotedAmount is required and must be greater than zero");
    }
    const depositMoney = order.depositRequired !== null && order.depositRequired !== undefined
        ? order.depositRequired
        : quoted * 0.5;
    const depositPercent = Math.min(1, Math.max(0, depositMoney / quoted));
    const invoiceExpiresAt = new Date();
    invoiceExpiresAt.setDate(invoiceExpiresAt.getDate() + 14);
    const dueDate = toDueDate(invoiceExpiresAt);
    const locationId = (0, squareClient_1.getSquareLocationId)();
    const { customerId: squareCustomerId } = await (0, squareClient_1.getOrCreateCustomer)({
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
    });
    const totalCents = Number((0, squareClient_1.dollarsToCents)(quoted));
    const depositCents = Math.min(totalCents, Math.max(0, Math.round(depositMoney * 100)));
    let paymentRequests;
    if (depositCents <= 0 || depositCents >= totalCents) {
        paymentRequests = [{ request_type: "BALANCE", due_date: dueDate }];
    }
    else {
        paymentRequests = [
            {
                request_type: "FIXED_AMOUNT",
                due_date: dueDate,
                fixed_amount_requested_money: {
                    amount: depositCents,
                    currency: "USD",
                },
            },
            { request_type: "BALANCE", due_date: dueDate },
        ];
    }
    const { orderId: squareOrderId } = await (0, squareClient_1.createOrder)({
        locationId,
        customerId: squareCustomerId,
        lineName: "Custom Apparel Order",
        quantity: "1",
        amountCents: (0, squareClient_1.dollarsToCents)(quoted),
    });
    // Invoice remains DRAFT. Later: Square Invoices publish via POST /v2/invoices/{id}/publish (not here).
    const inv = await (0, squareClient_1.createInvoice)({
        locationId,
        customerId: squareCustomerId,
        orderId: squareOrderId,
        title: `Draft — ${order.customerName}`,
        paymentRequests,
    });
    await client_1.db.order.update({
        where: { id: orderId },
        data: {
            squareCustomerId,
            squareOrderId,
            squareInvoiceId: inv.invoiceId,
            squareInvoiceNumber: inv.invoiceNumber,
            depositPercent,
            invoiceExpiresAt,
            status: "INVOICE_DRAFTED",
        },
    });
    return {
        success: true,
        squareCustomerId,
        squareOrderId,
        squareInvoiceId: inv.invoiceId,
        squareInvoiceNumber: inv.invoiceNumber,
    };
}
