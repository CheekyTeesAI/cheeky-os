"use strict";

/**
 * Operator Bridge — Schema Validation
 * Lightweight manual validation. No new packages required.
 */

const KNOWN_COMMAND_TYPES = new Set([
  // Allowed read/safe
  "READ_STATUS",
  "SUMMARIZE_OPEN_ORDERS",
  "FIND_ORDER",
  "CREATE_INTERNAL_TASK",
  "ADD_ORDER_NOTE",
  "RECOMMEND_NEXT_ACTIONS",
  "DRAFT_CUSTOMER_FOLLOWUP",
  "DRAFT_ESTIMATE_REQUEST",
  "DRAFT_INVOICE_REQUEST",
  "UPDATE_ORDER_STAGE_SAFE",
  // Blocked but recognized
  "SEND_EMAIL",
  "SEND_SMS",
  "SEND_INVOICE",
  "SEND_ESTIMATE",
  "MARK_PAID",
  "ORDER_BLANKS",
  "MOVE_TO_PRODUCTION_WITHOUT_DEPOSIT",
  "DELETE_ORDER",
  "DELETE_CUSTOMER",
  "DELETE_PAYMENT",
  "REFUND_PAYMENT",
]);

/**
 * Validates the body for /command/preview and /command/execute.
 * @param {any} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCommandInput(body) {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.push("Request body must be a JSON object.");
    return { valid: false, errors };
  }

  if (!body.commandType || typeof body.commandType !== "string" || !body.commandType.trim()) {
    errors.push("commandType is required and must be a non-empty string.");
  }

  if (!body.intent || typeof body.intent !== "string" || !body.intent.trim()) {
    errors.push("intent is required and must be a non-empty string describing the purpose.");
  }

  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    errors.push("payload is required and must be a JSON object (use {} if no payload fields are needed).");
  }

  if (body.requestedBy !== undefined && typeof body.requestedBy !== "string") {
    errors.push("requestedBy must be a string if provided.");
  }

  if (body.approval !== undefined) {
    if (typeof body.approval !== "object" || Array.isArray(body.approval)) {
      errors.push("approval must be an object if provided.");
    } else {
      if (body.approval.approved !== undefined && typeof body.approval.approved !== "boolean") {
        errors.push("approval.approved must be a boolean if provided.");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if a commandType is a recognized command (blocked or allowed).
 * @param {string} commandType
 * @returns {boolean}
 */
function isKnownCommand(commandType) {
  return KNOWN_COMMAND_TYPES.has(String(commandType || "").toUpperCase());
}

module.exports = {
  validateCommandInput,
  isKnownCommand,
  KNOWN_COMMAND_TYPES,
};
