/**
 * Maps Square API payment / invoice status strings to a small internal vocabulary
 * so webhook and payment handlers interpret external state consistently.
 * Does not replace Prisma OrderStatus — only normalizes Square-sourced strings.
 */

export type NormalizedSquarePaymentStatus =
  | "COLLECTED"
  | "PENDING"
  | "FAILED"
  | "CANCELED"
  | "UNKNOWN";

export type NormalizedSquareInvoiceStatus =
  | "PAID"
  | "PARTIALLY_PAID"
  | "DRAFT"
  | "SCHEDULED"
  | "UNPAID"
  | "CANCELED"
  | "UNKNOWN";

function norm(s: string | null | undefined): string {
  if (typeof s !== "string") return "";
  return s.trim().toUpperCase();
}

/**
 * Square Payments API `Payment.status` (and webhook payloads).
 * Legacy: code also treated APPROVED/CAPTURED as collected.
 */
export function normalizeSquarePaymentStatus(
  raw: string | null | undefined
): NormalizedSquarePaymentStatus {
  const s = norm(raw);
  if (!s) return "UNKNOWN";
  if (s === "COMPLETED" || s === "APPROVED" || s === "CAPTURED") {
    return "COLLECTED";
  }
  if (s === "PENDING") return "PENDING";
  if (s === "FAILED" || s === "REJECTED") return "FAILED";
  if (s === "CANCELED" || s === "CANCELLED") return "CANCELED";
  return "UNKNOWN";
}

export function isSquarePaymentCollected(
  n: NormalizedSquarePaymentStatus
): boolean {
  return n === "COLLECTED";
}

/**
 * Square Invoices API invoice status strings (subset + safe fallback).
 */
export function normalizeSquareInvoiceStatus(
  raw: string | null | undefined
): NormalizedSquareInvoiceStatus {
  const s = norm(raw);
  if (!s) return "UNKNOWN";
  if (s === "PAID") return "PAID";
  if (s === "PARTIALLY_PAID" || s === "PARTIALLY PAID") return "PARTIALLY_PAID";
  if (s === "PAYMENT_PENDING") return "PARTIALLY_PAID";
  if (s === "DRAFT") return "DRAFT";
  if (s === "SCHEDULED") return "SCHEDULED";
  if (s === "UNPAID") return "UNPAID";
  if (s === "CANCELED" || s === "CANCELLED") return "CANCELED";
  return "UNKNOWN";
}
