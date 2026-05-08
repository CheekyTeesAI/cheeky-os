"use strict";

/**
 * Square Sync — Schema Validation
 * Manual input validation. No new packages.
 */

/**
 * Validate input to POST /api/square-sync/manual
 * @param {any} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManualSyncInput(body) {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.push("Body must be a JSON object.");
    return { valid: false, errors };
  }

  if (body.amountTotal === undefined || body.amountTotal === null) {
    errors.push("amountTotal is required.");
  } else if (isNaN(Number(body.amountTotal)) || Number(body.amountTotal) < 0) {
    errors.push("amountTotal must be a non-negative number.");
  }

  if (body.amountPaid === undefined || body.amountPaid === null) {
    errors.push("amountPaid is required.");
  } else if (isNaN(Number(body.amountPaid)) || Number(body.amountPaid) < 0) {
    errors.push("amountPaid must be a non-negative number.");
  }

  const total = Number(body.amountTotal || 0);
  const paid = Number(body.amountPaid || 0);
  if (!isNaN(total) && !isNaN(paid) && paid > total && total > 0) {
    errors.push("amountPaid cannot exceed amountTotal.");
  }

  if (body.currency && typeof body.currency !== "string") {
    errors.push("currency must be a string if provided.");
  }

  if (body.orderId !== undefined && body.orderId !== null && typeof body.orderId !== "string") {
    errors.push("orderId must be a string if provided.");
  }

  if (body.squareInvoiceId !== undefined && body.squareInvoiceId !== null && typeof body.squareInvoiceId !== "string") {
    errors.push("squareInvoiceId must be a string if provided.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate input to POST /api/square-sync/reconcile
 * @param {any} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateReconcileInput(body) {
  const errors = [];

  if (body && typeof body !== "object") {
    errors.push("Body must be a JSON object if provided.");
    return { valid: false, errors };
  }

  if (body && body.limit !== undefined) {
    const lim = Number(body.limit);
    if (isNaN(lim) || lim < 1 || lim > 500) {
      errors.push("limit must be a number between 1 and 500.");
    }
  }

  if (body && body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    errors.push("dryRun must be a boolean if provided.");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateManualSyncInput,
  validateReconcileInput,
};
