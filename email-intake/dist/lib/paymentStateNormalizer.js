"use strict";
/**
 * Maps Square API payment / invoice status strings to a small internal vocabulary
 * so webhook and payment handlers interpret external state consistently.
 * Does not replace Prisma OrderStatus — only normalizes Square-sourced strings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSquarePaymentStatus = normalizeSquarePaymentStatus;
exports.isSquarePaymentCollected = isSquarePaymentCollected;
exports.normalizeSquareInvoiceStatus = normalizeSquareInvoiceStatus;
function norm(s) {
    if (typeof s !== "string")
        return "";
    return s.trim().toUpperCase();
}
/**
 * Square Payments API `Payment.status` (and webhook payloads).
 * Legacy: code also treated APPROVED/CAPTURED as collected.
 */
function normalizeSquarePaymentStatus(raw) {
    const s = norm(raw);
    if (!s)
        return "UNKNOWN";
    if (s === "COMPLETED" || s === "APPROVED" || s === "CAPTURED") {
        return "COLLECTED";
    }
    if (s === "PENDING")
        return "PENDING";
    if (s === "FAILED" || s === "REJECTED")
        return "FAILED";
    if (s === "CANCELED" || s === "CANCELLED")
        return "CANCELED";
    return "UNKNOWN";
}
function isSquarePaymentCollected(n) {
    return n === "COLLECTED";
}
/**
 * Square Invoices API invoice status strings (subset + safe fallback).
 */
function normalizeSquareInvoiceStatus(raw) {
    const s = norm(raw);
    if (!s)
        return "UNKNOWN";
    if (s === "PAID")
        return "PAID";
    if (s === "PARTIALLY_PAID" || s === "PARTIALLY PAID")
        return "PARTIALLY_PAID";
    if (s === "PAYMENT_PENDING")
        return "PARTIALLY_PAID";
    if (s === "DRAFT")
        return "DRAFT";
    if (s === "SCHEDULED")
        return "SCHEDULED";
    if (s === "UNPAID")
        return "UNPAID";
    if (s === "CANCELED" || s === "CANCELLED")
        return "CANCELED";
    return "UNKNOWN";
}
