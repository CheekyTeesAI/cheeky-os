/**
 * Square money events → internal normalized order-state vocabulary.
 * Does not replace Prisma `OrderStatus`; callers keep existing writes and transitions.
 *
 * Uses `paymentStateNormalizer` for Square payment/invoice strings, then maps to
 * a small cross-cutting contract for logging and future convergence.
 */

import type {
  NormalizedSquareInvoiceStatus,
  NormalizedSquarePaymentStatus,
} from "./paymentStateNormalizer";

/** Internal money/order lane (not 1:1 with every Prisma enum value). */
export type NormalizedMoneyOrderState =
  | "UNPAID"
  | "DEPOSIT_PAID"
  | "PAID_IN_FULL"
  | "PAYMENT_FAILED"
  | "CANCELED"
  | "UNKNOWN";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function extractPaymentIdFromPayload(payload: unknown): string | null {
  const p = asRecord(payload);
  const data = asRecord(p?.data);
  const obj = asRecord(data?.object);
  const pay = asRecord(obj?.payment);
  const id = pay?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export type SquareMoneySyncContract = {
  source: "SQUARE";
  sourceEventType: string | null;
  /** Raw external strings as seen on payload (trimmed when present). */
  externalPaymentStatus: string | null;
  externalInvoiceStatus: string | null;
  /** After `normalizeSquare*` helpers. */
  normalizedPayment: NormalizedSquarePaymentStatus;
  normalizedInvoice: NormalizedSquareInvoiceStatus;
  normalizedOrderState: NormalizedMoneyOrderState;
  amountPaid: number | null;
  totalAmount: number | null;
  depositAmount: number | null;
  references: {
    squarePaymentId: string | null;
    squareInvoiceId: string | null;
    squareInvoiceNumber: string | null;
    squareOrderId: string | null;
  };
  notes: string | null;
  rawPayload: unknown;
};

/**
 * Map normalized Square payment + invoice tokens to the internal money state.
 * Amount-agnostic (signal-only); deposit vs full-invoice is resolved elsewhere via ledgers.
 */
export function mapSquareSignalsToNormalizedMoneyOrderState(input: {
  normPay: NormalizedSquarePaymentStatus;
  normInv: NormalizedSquareInvoiceStatus;
  eventType: string | null;
}): { state: NormalizedMoneyOrderState; confidence: "HIGH" | "MEDIUM" } {
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

export function compactSyncLogLine(c: SquareMoneySyncContract): string {
  const r = c.references;
  return (
    `sync_state=${c.normalizedOrderState} pay=${c.normalizedPayment} inv=${c.normalizedInvoice} ` +
    `evt=${c.sourceEventType ?? "?"}` +
    ` payId=${r.squarePaymentId ?? "-"} invId=${r.squareInvoiceId ?? "-"}`
  );
}

/**
 * Full sync view after webhook has resolved order + computed new amount paid (read model for logs / future use).
 */
export function buildSquareWebhookMoneySyncView(input: {
  payload: unknown;
  eventType: string | null;
  squarePayStatus: string | null;
  squareInvStatus: string | null;
  normPay: NormalizedSquarePaymentStatus;
  normInv: NormalizedSquareInvoiceStatus;
  invoiceId: string | null;
  sqOrderId: string | null;
  invoiceNumber: string | null;
  newAmountPaid: number;
  order: {
    quotedAmount: number | null;
    depositAmount: number | null;
    /** Prisma `Order.squareId` — legacy Square payment id on the order row */
    squareId: string | null;
  };
}): SquareMoneySyncContract {
  const mapped = mapSquareSignalsToNormalizedMoneyOrderState({
    normPay: input.normPay,
    normInv: input.normInv,
    eventType: input.eventType,
  });
  const payId =
    extractPaymentIdFromPayload(input.payload) ?? input.order.squareId;

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
    notes:
      mapped.confidence === "MEDIUM"
        ? "signal-derived; prisma status still follows amount + transition rules"
        : null,
    rawPayload: input.payload,
  };
}

/** `payment.completed` path that creates a new order (legacy `OrderStatus.PAID`). */
export function buildPaymentCompletedMoneySyncView(input: {
  payload: unknown;
  eventType: string | null;
  rawPaymentStatus: string | null;
  normPay: NormalizedSquarePaymentStatus;
  squarePaymentId: string | null;
  squareOrderId: string | null;
  totalAmountDollars: number;
}): SquareMoneySyncContract {
  let state: NormalizedMoneyOrderState = "UNKNOWN";
  if (input.normPay === "COLLECTED") state = "PAID_IN_FULL";
  else if (input.normPay === "FAILED") state = "PAYMENT_FAILED";
  else if (input.normPay === "CANCELED") state = "CANCELED";

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
