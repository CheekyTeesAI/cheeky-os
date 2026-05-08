"use strict";

/**
 * Square Sync — Payment/Invoice Mapper
 * Normalizes Square webhook events and manual payloads into a
 * safe, consistent shape for use by guardrails and the sync service.
 *
 * IRON LAWS:
 *   - Never fake payment status
 *   - Fail closed: missing/ambiguous data → UNKNOWN, productionEligible: false
 *   - Square amounts are in cents (smallest unit). Dollar amounts accepted too.
 */

// Payment statuses (normalized, never raw Square values exposed)
const PAYMENT_STATUSES = {
  UNKNOWN: "UNKNOWN",
  UNPAID: "UNPAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  DEPOSIT_PAID: "DEPOSIT_PAID",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  CANCELED: "CANCELED",
  FAILED: "FAILED",
};

// Square invoice statuses → our internal status
const SQUARE_INVOICE_STATUS_MAP = {
  DRAFT: "UNPAID",
  UNPAID: "UNPAID",
  SCHEDULED: "UNPAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_PAID",
  REFUNDED: "REFUNDED",
  CANCELED: "CANCELED",
  FAILED: "FAILED",
};

// Square payment statuses → our internal status
const SQUARE_PAYMENT_STATUS_MAP = {
  APPROVED: "PARTIALLY_PAID",
  COMPLETED: "PAID",
  CANCELED: "CANCELED",
  FAILED: "FAILED",
};

/**
 * Safe integer cent-to-dollar conversion.
 * Handles already-dollar values (< 10000 without explicit flag), cents, and null.
 * @param {number|string|null} value
 * @param {boolean} isCents - Force interpretation as cents
 * @returns {number}
 */
function toDollars(value, isCents) {
  const n = Number(value);
  if (isNaN(n) || n < 0) return 0;
  if (isCents === true) return n / 100;
  // Heuristic: Square amounts > 100 and divisible by 1 are likely cents
  // If value looks like dollars (< 100000 and has decimals), treat as dollars
  // If value is whole integer >= 100, treat as cents
  if (Number.isInteger(n) && n >= 100) return n / 100;
  return n;
}

/**
 * Determine normalized payment status from amount data.
 * @param {{amountTotal: number, amountPaid: number, squareStatus?: string}} input
 * @returns {string}
 */
function determinePaymentStatus(input) {
  const total = Number(input.amountTotal || 0);
  const paid = Number(input.amountPaid || 0);
  const squareStatus = String(input.squareStatus || "").toUpperCase();

  // Square status overrides for terminal states
  if (squareStatus === "CANCELED" || squareStatus === "CANCEL") return PAYMENT_STATUSES.CANCELED;
  if (squareStatus === "FAILED") return PAYMENT_STATUSES.FAILED;
  if (squareStatus === "REFUNDED") return PAYMENT_STATUSES.REFUNDED;

  if (paid <= 0) return PAYMENT_STATUSES.UNPAID;
  if (total <= 0) {
    // No total amount on record — any payment means DEPOSIT_PAID (uncertain)
    return paid > 0 ? PAYMENT_STATUSES.DEPOSIT_PAID : PAYMENT_STATUSES.UNKNOWN;
  }
  if (paid >= total) return PAYMENT_STATUSES.PAID;
  if (paid > 0 && paid < total) return PAYMENT_STATUSES.PARTIALLY_PAID;
  return PAYMENT_STATUSES.UNKNOWN;
}

/**
 * Determine deposit status.
 * @param {{amountTotal: number, amountPaid: number, depositPercent?: number}} input
 * @returns {string}
 */
function determineDepositStatus(input) {
  const total = Number(input.amountTotal || 0);
  const paid = Number(input.amountPaid || 0);
  const depositPct = Number(input.depositPercent || 50) / 100;

  if (paid <= 0) return "NONE";
  if (total > 0 && paid >= total) return "PAID";
  if (total > 0) {
    const depositThreshold = total * depositPct;
    if (paid >= depositThreshold) return "PAID"; // deposit requirement met
    return "PARTIAL";
  }
  // No total → any payment qualifies as deposit paid
  return "PAID";
}

/**
 * Determine if an order is eligible for production.
 * IRON LAW: productionEligible = false unless we have verified paid evidence.
 * @param {{amountPaid: number, amountTotal: number, paymentStatus: string, depositStatus: string}} input
 * @returns {boolean}
 */
function determineProductionEligibility(input) {
  const paid = Number(input.amountPaid || 0);
  const status = String(input.paymentStatus || "UNKNOWN");
  const deposit = String(input.depositStatus || "NONE");

  // Hard blocks
  if (status === PAYMENT_STATUSES.CANCELED) return false;
  if (status === PAYMENT_STATUSES.FAILED) return false;
  if (status === PAYMENT_STATUSES.REFUNDED) return false;
  if (status === PAYMENT_STATUSES.UNKNOWN) return false;
  if (status === PAYMENT_STATUSES.UNPAID) return false;
  if (paid <= 0) return false;

  // Eligible if deposit is confirmed
  if (deposit === "PAID" || status === PAYMENT_STATUSES.PAID || status === PAYMENT_STATUSES.DEPOSIT_PAID) {
    return paid > 0;
  }

  return false;
}

/**
 * Normalize a Square payment webhook payload.
 * @param {object} squarePayload - Raw Square payment object (from data.object.payment)
 * @returns {object}
 */
function normalizeSquarePayment(squarePayload) {
  if (!squarePayload) return _emptyRecord();

  const payment = squarePayload.payment || squarePayload;
  const amountMoney = payment.amount_money || payment.amountMoney || {};
  const totalMoney = payment.total_money || payment.totalMoney || {};

  const amountPaid = toDollars(amountMoney.amount, true);
  const amountTotal = toDollars(totalMoney.amount || amountMoney.amount, true) || amountPaid;

  const squareStatus = String(payment.status || "").toUpperCase();
  const mappedStatus = SQUARE_PAYMENT_STATUS_MAP[squareStatus] || null;

  const paymentStatus = mappedStatus || determinePaymentStatus({ amountTotal, amountPaid });
  const depositStatus = determineDepositStatus({ amountTotal, amountPaid });
  const productionEligible = determineProductionEligibility({ amountPaid, amountTotal, paymentStatus, depositStatus });

  return {
    squarePaymentId: payment.id || null,
    squareInvoiceId: payment.invoice_id || payment.invoiceId || null,
    squareOrderId: payment.order_id || payment.orderId || null,
    squareCusomerId: payment.customer_id || payment.customerId || null,
    customerName: payment.buyer_email_address || null,
    amountTotal,
    amountPaid,
    amountDue: Math.max(0, amountTotal - amountPaid),
    currency: (amountMoney.currency || "USD").toUpperCase(),
    paymentStatus,
    depositStatus,
    productionEligible,
    fullyPaid: paymentStatus === PAYMENT_STATUSES.PAID,
    partiallyPaid: paymentStatus === PAYMENT_STATUSES.PARTIALLY_PAID || paymentStatus === PAYMENT_STATUSES.DEPOSIT_PAID,
    source: "square_payment",
    rawEventType: "payment",
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Normalize a Square invoice webhook payload.
 * @param {object} squarePayload - Raw Square invoice object (from data.object.invoice)
 * @returns {object}
 */
function normalizeSquareInvoice(squarePayload) {
  if (!squarePayload) return _emptyRecord();

  const invoice = squarePayload.invoice || squarePayload;
  const paymentRequests = invoice.payment_requests || invoice.paymentRequests || [];
  const firstRequest = paymentRequests[0] || {};

  const computedAmount = firstRequest.computed_amount_money || firstRequest.computedAmountMoney || {};
  const totalCompleted = firstRequest.total_completed_amount_money || firstRequest.totalCompletedAmountMoney || {};

  const amountTotal = toDollars(computedAmount.amount, true);
  const amountPaid = toDollars(totalCompleted.amount, true);

  const squareStatus = String(invoice.status || "").toUpperCase();
  const mappedStatus = SQUARE_INVOICE_STATUS_MAP[squareStatus] || null;

  const paymentStatus = mappedStatus || determinePaymentStatus({ amountTotal, amountPaid, squareStatus });
  const depositStatus = determineDepositStatus({ amountTotal, amountPaid });
  const productionEligible = determineProductionEligibility({ amountPaid, amountTotal, paymentStatus, depositStatus });

  const recipient = invoice.primary_recipient || invoice.primaryRecipient || {};

  return {
    squarePaymentId: null,
    squareInvoiceId: invoice.id || null,
    squareOrderId: invoice.order_id || invoice.orderId || null,
    squareCustomerId: recipient.customer_id || recipient.customerId || null,
    customerName: recipient.given_name || recipient.givenName || null,
    customerEmail: recipient.email_address || recipient.emailAddress || null,
    amountTotal,
    amountPaid,
    amountDue: Math.max(0, amountTotal - amountPaid),
    currency: (computedAmount.currency || "USD").toUpperCase(),
    paymentStatus,
    depositStatus,
    productionEligible,
    fullyPaid: paymentStatus === PAYMENT_STATUSES.PAID,
    partiallyPaid: paymentStatus === PAYMENT_STATUSES.PARTIALLY_PAID || paymentStatus === PAYMENT_STATUSES.DEPOSIT_PAID,
    source: "square_invoice",
    rawEventType: "invoice",
    squareInvoiceStatus: squareStatus,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Normalize a manual sync payload (from /api/square-sync/manual).
 * Amounts may already be in dollars.
 * @param {object} payload
 * @returns {object}
 */
function normalizeManualPayload(payload) {
  if (!payload || typeof payload !== "object") return _emptyRecord();

  const amountTotal = toDollars(payload.amountTotal);
  const amountPaid = toDollars(payload.amountPaid);

  const paymentStatus = determinePaymentStatus({ amountTotal, amountPaid });
  const depositStatus = determineDepositStatus({ amountTotal, amountPaid });
  const productionEligible = determineProductionEligibility({ amountPaid, amountTotal, paymentStatus, depositStatus });

  return {
    squarePaymentId: payload.squarePaymentId || null,
    squareInvoiceId: payload.squareInvoiceId || null,
    squareOrderId: payload.squareOrderId || null,
    squareCustomerId: payload.squareCustomerId || null,
    customerName: payload.customerName || null,
    customerEmail: payload.customerEmail || null,
    orderId: payload.orderId || null,
    amountTotal,
    amountPaid,
    amountDue: Math.max(0, amountTotal - amountPaid),
    currency: String(payload.currency || "USD").toUpperCase(),
    paymentStatus,
    depositStatus,
    productionEligible,
    fullyPaid: paymentStatus === PAYMENT_STATUSES.PAID,
    partiallyPaid: paymentStatus === PAYMENT_STATUSES.PARTIALLY_PAID || paymentStatus === PAYMENT_STATUSES.DEPOSIT_PAID,
    source: String(payload.source || "manual"),
    rawEventType: "manual",
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Summarize a Square webhook event for logging.
 * @param {object} event - Raw Square webhook body
 * @returns {object}
 */
function summarizeSquareEvent(event) {
  if (!event || typeof event !== "object") return { type: "UNKNOWN", summary: "No event data" };

  const type = String(event.type || event.event_type || "UNKNOWN");
  const data = event.data || {};
  const obj = data.object || {};

  let summary = `Square event: ${type}`;
  let squareId = null;
  let amountPaid = 0;

  if (obj.payment) {
    squareId = obj.payment.id;
    amountPaid = toDollars((obj.payment.amount_money || {}).amount, true);
    summary = `Payment ${squareId}: $${amountPaid} (${obj.payment.status || "unknown"})`;
  } else if (obj.invoice) {
    squareId = obj.invoice.id;
    summary = `Invoice ${squareId}: status=${obj.invoice.status || "unknown"}`;
  } else if (obj.order) {
    squareId = obj.order.id;
    summary = `Order ${squareId}: state=${obj.order.state || "unknown"}`;
  }

  return { type, summary, squareId, amountPaid };
}

function _emptyRecord() {
  return {
    squarePaymentId: null,
    squareInvoiceId: null,
    squareOrderId: null,
    squareCustomerId: null,
    customerName: null,
    customerEmail: null,
    orderId: null,
    amountTotal: 0,
    amountPaid: 0,
    amountDue: 0,
    currency: "USD",
    paymentStatus: PAYMENT_STATUSES.UNKNOWN,
    depositStatus: "NONE",
    productionEligible: false,
    fullyPaid: false,
    partiallyPaid: false,
    source: "unknown",
    rawEventType: null,
    receivedAt: new Date().toISOString(),
  };
}

module.exports = {
  normalizeSquarePayment,
  normalizeSquareInvoice,
  normalizeManualPayload,
  determinePaymentStatus,
  determineDepositStatus,
  determineProductionEligibility,
  summarizeSquareEvent,
  toDollars,
  PAYMENT_STATUSES,
};
