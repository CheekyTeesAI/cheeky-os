"use strict";

function normalizeToken(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ORDER_MAP = {
  INTAKE: "INTAKE",
  NEW: "INTAKE",
  OPEN: "INTAKE",
  ESTIMATE: "ESTIMATE",
  ESTIMATE_SENT: "ESTIMATE",
  QUOTE_SENT: "ESTIMATE",
  AWAITING_APPROVAL: "APPROVAL_PENDING",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  EVALUATE_APPROVE: "APPROVAL_PENDING",
  APPROVED: "APPROVED",
  DEPOSIT_PAID: "APPROVED",
  ART_PENDING: "ART_PENDING",
  ART_NEEDED: "ART_PENDING",
  ART_CHECK: "ART_PENDING",
  READY_FOR_PRODUCTION: "READY_FOR_PRODUCTION",
  PRODUCTION_READY: "READY_FOR_PRODUCTION",
  PRINTING: "IN_PRODUCTION",
  IN_PRODUCTION: "IN_PRODUCTION",
  PRODUCTION: "IN_PRODUCTION",
  QC: "QC",
  QUALITY_CHECK: "QC",
  READY: "COMPLETE",
  COMPLETE: "COMPLETE",
  COMPLETED: "COMPLETE",
  ON_HOLD: "ON_HOLD",
  HOLD: "ON_HOLD",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
};

const ART_MAP = {
  NEEDS_ART: "NEEDS_ART",
  MISSING: "NEEDS_ART",
  ART_RECEIVED: "ART_RECEIVED",
  RECEIVED: "ART_RECEIVED",
  ART_IN_REVIEW: "ART_IN_REVIEW",
  IN_REVIEW: "ART_IN_REVIEW",
  PENDING_REVIEW: "ART_IN_REVIEW",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  ART_APPROVED: "ART_APPROVED",
  APPROVED: "ART_APPROVED",
};

const PAYMENT_MAP = {
  UNPAID: "UNPAID",
  NONE: "UNPAID",
  PAST_DUE: "OVERDUE",
  OVERDUE: "OVERDUE",
  PARTIAL: "PARTIALLY_PAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  DEPOSIT_PAID: "DEPOSIT_PAID",
  PAID: "PAID",
  PAID_IN_FULL: "PAID",
};

function normalizeOrderStatus(v) {
  const t = normalizeToken(v);
  return ORDER_MAP[t] || "INTAKE";
}

function normalizeArtStatus(v) {
  const t = normalizeToken(v);
  return ART_MAP[t] || "NEEDS_ART";
}

function normalizePaymentStatus(v) {
  const t = normalizeToken(v);
  return PAYMENT_MAP[t] || "UNPAID";
}

/** All raw DB tokens that normalize to the same canonical order status (for Prisma `in` clauses). */
function orderDbStatusesForCanonical(canon) {
  const want = String(canon || "").trim().toUpperCase();
  const out = [];
  for (const [k, v] of Object.entries(ORDER_MAP)) {
    if (v === want) out.push(k);
  }
  return [...new Set(out)];
}

function unionDbStatusesForCanonicals(canonicals) {
  const set = new Set();
  for (const c of canonicals || []) {
    for (const s of orderDbStatusesForCanonical(c)) set.add(s);
  }
  return [...set];
}

module.exports = {
  normalizeOrderStatus,
  normalizeArtStatus,
  normalizePaymentStatus,
  orderDbStatusesForCanonical,
  unionDbStatusesForCanonicals,
};
