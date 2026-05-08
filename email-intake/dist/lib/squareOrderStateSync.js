"use strict";
/**
 * Square money events → internal normalized order-state vocabulary.
 * Does not replace Prisma `OrderStatus`; callers keep existing writes and transitions.
 *
 * Uses `paymentStateNormalizer` for Square payment/invoice strings, then maps to
 * a small cross-cutting contract for logging and future convergence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSquareSignalsToNormalizedMoneyOrderState = mapSquareSignalsToNormalizedMoneyOrderState;
exports.compactSyncLogLine = compactSyncLogLine;
exports.buildSquareWebhookMoneySyncView = buildSquareWebhookMoneySyncView;
exports.buildPaymentCompletedMoneySyncView = buildPaymentCompletedMoneySyncView;
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v)
        ? v
        : null;
}
function extractPaymentIdFromPayload(payload) {
    const p = asRecord(payload);
    const data = asRecord(p?.data);
    const obj = asRecord(data?.object);
    const pay = asRecord(obj?.payment);
    const id = pay?.id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
}
/**
 * Map normalized Square payment + invoice tokens to the internal money state.
 * Amount-agnostic (signal-only); deposit vs full-invoice is resolved elsewhere via ledgers.
 */
function mapSquareSignalsToNormalizedMoneyOrderState(input) {
    const { normPay, normInv } = input;
    if (normPay === "FAILED") {
        return { state: "PAYMENT_FAILED", confidence: "HIGH" };
    }
    if (normPay === "CANCELED" || normInv === "CANCELED") {
        return { state: "CANCELED", confidence: "HIGH" };
    }
    if (normInv === "PAID") {
        return { state: "PAID_IN_FULL", confidence: "HIGH" };
    }
    if (normInv === "PARTIALLY_PAID") {
        return { state: "DEPOSIT_PAID", confidence: "MEDIUM" };
    }
    if (normInv === "UNPAID" || normInv === "DRAFT" || normInv === "SCHEDULED") {
        if (normPay === "COLLECTED") {
            return { state: "DEPOSIT_PAID", confidence: "MEDIUM" };
        }
        return { state: "UNPAID", confidence: "MEDIUM" };
    }
    if (normPay === "COLLECTED" && normInv === "UNKNOWN") {
        return { state: "DEPOSIT_PAID", confidence: "MEDIUM" };
    }
    if (normPay === "PENDING" || normInv === "UNKNOWN") {
        return { state: "UNKNOWN", confidence: "MEDIUM" };
    }
    return { state: "UNKNOWN", confidence: "MEDIUM" };
}
function compactSyncLogLine(c) {
    const r = c.references;
    return (`sync_state=${c.normalizedOrderState} pay=${c.normalizedPayment} inv=${c.normalizedInvoice} ` +
        `evt=${c.sourceEventType ?? "?"}` +
        ` payId=${r.squarePaymentId ?? "-"} invId=${r.squareInvoiceId ?? "-"}`);
}
/**
 * Full sync view after webhook has resolved order + computed new amount paid (read model for logs / future use).
 */
function buildSquareWebhookMoneySyncView(input) {
    const mapped = mapSquareSignalsToNormalizedMoneyOrderState({
        normPay: input.normPay,
        normInv: input.normInv,
        eventType: input.eventType,
    });
    const payId = extractPaymentIdFromPayload(input.payload) ?? input.order.squareId;
    return {
        source: "SQUARE",
        sourceEventType: input.eventType,
        externalPaymentStatus: input.squarePayStatus,
        externalInvoiceStatus: input.squareInvStatus,
        normalizedPayment: input.normPay,
        normalizedInvoice: input.normInv,
        normalizedOrderState: mapped.state,
        amountPaid: input.newAmountPaid,
        totalAmount: input.order.quotedAmount,
        depositAmount: input.order.depositAmount,
        references: {
            squarePaymentId: payId,
            squareInvoiceId: input.invoiceId,
            squareInvoiceNumber: input.invoiceNumber,
            squareOrderId: input.sqOrderId,
        },
        notes: mapped.confidence === "MEDIUM"
            ? "signal-derived; prisma status still follows amount + transition rules"
            : null,
        rawPayload: input.payload,
    };
}
/** `payment.completed` path that creates a new order (legacy `OrderStatus.PAID`). */
function buildPaymentCompletedMoneySyncView(input) {
    let state = "UNKNOWN";
    if (input.normPay === "COLLECTED")
        state = "PAID_IN_FULL";
    else if (input.normPay === "FAILED")
        state = "PAYMENT_FAILED";
    else if (input.normPay === "CANCELED")
        state = "CANCELED";
    return {
        source: "SQUARE",
        sourceEventType: input.eventType,
        externalPaymentStatus: input.rawPaymentStatus,
        externalInvoiceStatus: null,
        normalizedPayment: input.normPay,
        normalizedInvoice: "UNKNOWN",
        normalizedOrderState: state,
        amountPaid: input.totalAmountDollars,
        totalAmount: input.totalAmountDollars,
        depositAmount: input.totalAmountDollars,
        references: {
            squarePaymentId: input.squarePaymentId,
            squareInvoiceId: null,
            squareInvoiceNumber: null,
            squareOrderId: input.squareOrderId,
        },
        notes: "payment.completed new-order create (status remains PAID in DB)",
        rawPayload: input.payload,
    };
}
