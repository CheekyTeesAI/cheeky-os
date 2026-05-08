"use strict";

/**
 * Square Sync — Guardrails
 * Controls whether a sync record is safe to apply to a local order.
 * IRON LAWS: Fail closed. Never fake paid. Deposit required for production.
 */

const { PAYMENT_STATUSES } = require("./squareSync.mapper");

const TERMINAL_BLOCK_STATUSES = new Set([
  PAYMENT_STATUSES.CANCELED,
  PAYMENT_STATUSES.FAILED,
  PAYMENT_STATUSES.REFUNDED,
]);

/**
 * Full guardrail evaluation for a normalized sync record.
 * @param {object} syncRecord - Output from squareSync.mapper
 * @returns {{ allowed: boolean, blocked: boolean, reason: string|null, riskLevel: string }}
 */
function evaluateSyncRecord(syncRecord) {
  if (!syncRecord || typeof syncRecord !== "object") {
    return { allowed: false, blocked: true, reason: "Sync record is missing or invalid.", riskLevel: "high" };
  }

  const { paymentStatus, amountPaid, amountTotal, squarePaymentId, squareInvoiceId, source } = syncRecord;

  // Block terminal states
  if (TERMINAL_BLOCK_STATUSES.has(paymentStatus)) {
    return {
      allowed: false,
      blocked: true,
      reason: `Payment status is ${paymentStatus}. Cannot update order fields for canceled/failed/refunded payments.`,
      riskLevel: "high",
    };
  }

  // Block completely unknown/empty records
  if (paymentStatus === PAYMENT_STATUSES.UNKNOWN) {
    if (!squarePaymentId && !squareInvoiceId) {
      return {
        allowed: false,
        blocked: true,
        reason: "Cannot update order: no Square IDs and payment status is UNKNOWN.",
        riskLevel: "high",
      };
    }
    // Allow unknown status through if we at least have a Square ID (may update squareInvoiceId etc.)
  }

  // Block if someone tries to manually force paid with no amount
  if (source === "manual" || source === "manual-test") {
    if (Number(amountPaid) <= 0 && paymentStatus !== PAYMENT_STATUSES.UNPAID) {
      return {
        allowed: false,
        blocked: true,
        reason: "Manual sync: amountPaid is 0 but paymentStatus is not UNPAID. Cannot set paid status without verified amount.",
        riskLevel: "high",
      };
    }
  }

  const riskLevel = _getRiskLevel(syncRecord);

  return {
    allowed: true,
    blocked: false,
    reason: null,
    riskLevel,
  };
}

/**
 * Can we update the payment status fields on an order?
 * @param {object} syncRecord
 * @returns {{ allowed: boolean, blocked: boolean, reason: string|null, riskLevel: string }}
 */
function canUpdatePaymentStatus(syncRecord) {
  return evaluateSyncRecord(syncRecord);
}

/**
 * Can we mark deposit as paid on an order?
 * Requires: amountPaid > 0 AND depositStatus === "PAID" AND not terminal
 * @param {object} syncRecord
 * @returns {{ allowed: boolean, blocked: boolean, reason: string|null }}
 */
function canMarkDepositPaid(syncRecord) {
  const base = evaluateSyncRecord(syncRecord);
  if (!base.allowed) return base;

  const paid = Number(syncRecord.amountPaid || 0);
  const deposit = String(syncRecord.depositStatus || "NONE");

  if (paid <= 0) {
    return {
      allowed: false,
      blocked: true,
      reason: "Cannot mark deposit paid: amountPaid is 0. Square must confirm a payment first.",
      riskLevel: "high",
    };
  }

  if (deposit !== "PAID") {
    return {
      allowed: false,
      blocked: true,
      reason: `Cannot mark deposit paid: deposit status is "${deposit}". Deposit threshold not met.`,
      riskLevel: "medium",
    };
  }

  return { allowed: true, blocked: false, reason: null, riskLevel: "low" };
}

/**
 * Can we mark an order as production eligible?
 * Strictest check: requires verified payment AND deposit confirmation.
 * @param {object} syncRecord
 * @returns {{ allowed: boolean, blocked: boolean, reason: string|null }}
 */
function canMarkProductionEligible(syncRecord) {
  const depositCheck = canMarkDepositPaid(syncRecord);
  if (!depositCheck.allowed) return depositCheck;

  if (!syncRecord.productionEligible) {
    return {
      allowed: false,
      blocked: true,
      reason: "Production eligibility not met based on payment data. Check amountPaid, depositStatus, and paymentStatus.",
      riskLevel: "high",
    };
  }

  return { allowed: true, blocked: false, reason: null, riskLevel: "low" };
}

/**
 * Validate raw input to the manual sync endpoint.
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSquareSyncInput(input) {
  const errors = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    errors.push("Request body must be a JSON object.");
    return { valid: false, errors };
  }

  const amountTotal = Number(input.amountTotal);
  const amountPaid = Number(input.amountPaid);

  if (input.amountTotal === undefined || input.amountTotal === null) {
    errors.push("amountTotal is required.");
  } else if (isNaN(amountTotal) || amountTotal < 0) {
    errors.push("amountTotal must be a non-negative number.");
  }

  if (input.amountPaid === undefined || input.amountPaid === null) {
    errors.push("amountPaid is required.");
  } else if (isNaN(amountPaid) || amountPaid < 0) {
    errors.push("amountPaid must be a non-negative number.");
  }

  if (!isNaN(amountTotal) && !isNaN(amountPaid) && amountPaid > amountTotal && amountTotal > 0) {
    errors.push("amountPaid cannot exceed amountTotal.");
  }

  if (input.currency && typeof input.currency !== "string") {
    errors.push("currency must be a string if provided.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get a human-readable block reason for a sync record.
 * @param {object} input
 * @returns {string}
 */
function blockReason(input) {
  const result = evaluateSyncRecord(input);
  return result.reason || "No block reason.";
}

/**
 * Production eligibility helper for the Operator Bridge.
 * @param {object} order - Prisma Order row (normalized)
 * @returns {{ eligible: boolean, blocked: boolean, reason: string, source: string }}
 */
function getProductionEligibility(order) {
  if (!order) {
    return { eligible: false, blocked: true, reason: "No order data.", source: "square-sync" };
  }

  const paid = Number(order.amountPaid || 0);
  const depositPaid = Boolean(order.depositPaid || order.depositReceived);
  const depositStatus = String(order.depositStatus || "NONE");
  const paymentStatus = String(order.squarePaymentStatus || order.paymentStatus || "UNKNOWN");

  // Terminal payment states block production
  if (TERMINAL_BLOCK_STATUSES.has(paymentStatus)) {
    return {
      eligible: false,
      blocked: true,
      reason: `Order payment status is ${paymentStatus}. Production blocked.`,
      source: "square-sync",
    };
  }

  // Must have some payment evidence
  if (paid <= 0 && !depositPaid && depositStatus === "NONE") {
    return {
      eligible: false,
      blocked: true,
      reason: "No deposit or payment verified. Collect deposit before production.",
      source: "square-sync",
    };
  }

  // Check deposit status
  if (depositStatus === "PAID" || depositPaid || paid > 0) {
    return {
      eligible: true,
      blocked: false,
      reason: depositStatus === "PAID"
        ? "Deposit verified through Square sync."
        : paid > 0
        ? `Partial payment of $${paid} received.`
        : "Deposit marked paid internally.",
      source: "square-sync",
    };
  }

  return {
    eligible: false,
    blocked: true,
    reason: "Deposit not verified. Cannot confirm production eligibility.",
    source: "square-sync",
  };
}

function _getRiskLevel(syncRecord) {
  const { paymentStatus, amountPaid } = syncRecord;
  if (paymentStatus === PAYMENT_STATUSES.PAID) return "low";
  if (paymentStatus === PAYMENT_STATUSES.PARTIALLY_PAID || paymentStatus === PAYMENT_STATUSES.DEPOSIT_PAID) return "low";
  if (paymentStatus === PAYMENT_STATUSES.UNPAID) return "medium";
  return "medium";
}

module.exports = {
  evaluateSyncRecord,
  canUpdatePaymentStatus,
  canMarkDepositPaid,
  canMarkProductionEligible,
  validateSquareSyncInput,
  blockReason,
  getProductionEligibility,
};
