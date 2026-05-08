"use strict";

/**
 * Operator Bridge — Guardrails System
 * Controls which commands are allowed, blocked, or require approval/payment verification.
 * IRON LAW: Fail closed. Never auto-send. Never bypass deposit rules.
 */

const BLOCKED_COMMANDS = new Set([
  "SEND_EMAIL",
  "SEND_SMS",
  "SEND_INVOICE",
  "SEND_ESTIMATE",
  "MARK_PAID",
  "ORDER_BLANKS",
  "DELETE_ORDER",
  "DELETE_CUSTOMER",
  "DELETE_PAYMENT",
  "REFUND_PAYMENT",
  "MOVE_TO_PRODUCTION_WITHOUT_DEPOSIT",
]);

const APPROVAL_REQUIRED_COMMANDS = new Set([
  "UPDATE_ORDER_STAGE_SAFE",
  "DRAFT_INVOICE_REQUEST",
  "DRAFT_ESTIMATE_REQUEST",
  "DRAFT_CUSTOMER_FOLLOWUP",
]);

const LOW_RISK_COMMANDS = new Set([
  "READ_STATUS",
  "SUMMARIZE_OPEN_ORDERS",
  "FIND_ORDER",
  "CREATE_INTERNAL_TASK",
  "ADD_ORDER_NOTE",
  "RECOMMEND_NEXT_ACTIONS",
]);

// Stages that imply production is starting — require deposit verification
const PRODUCTION_STAGES = new Set([
  "PRODUCTION_READY",
  "PRODUCTION",
  "PRINTING",
  "QC",
  "READY",
]);

const SAFE_ALTERNATIVES = {
  SEND_EMAIL: "DRAFT_CUSTOMER_FOLLOWUP",
  SEND_SMS: "DRAFT_CUSTOMER_FOLLOWUP",
  SEND_INVOICE: "DRAFT_INVOICE_REQUEST",
  SEND_ESTIMATE: "DRAFT_ESTIMATE_REQUEST",
  MARK_PAID: "Use Square Dashboard to record payments. Cheeky OS never fakes payment status.",
  ORDER_BLANKS: "Verify deposit first, then use the garment ordering workflow.",
  MOVE_TO_PRODUCTION_WITHOUT_DEPOSIT: "Use UPDATE_ORDER_STAGE_SAFE after verifying deposit status.",
};

/**
 * Returns true if command is permanently blocked.
 */
function isBlockedCommand(commandType) {
  return BLOCKED_COMMANDS.has(String(commandType || "").toUpperCase());
}

/**
 * Returns true if command requires operator approval before execution.
 */
function requiresApproval(commandType) {
  return APPROVAL_REQUIRED_COMMANDS.has(String(commandType || "").toUpperCase());
}

/**
 * Returns true if command requires payment/deposit verification.
 * Triggered when moving an order to a production stage.
 */
function requiresPaymentVerification(commandType, payload) {
  const ct = String(commandType || "").toUpperCase();
  if (ct === "UPDATE_ORDER_STAGE_SAFE") {
    const targetStage = String((payload && payload.targetStage) || "").toUpperCase();
    if (PRODUCTION_STAGES.has(targetStage)) return true;
  }
  return false;
}

/**
 * Returns risk level for a command: "blocked" | "medium" | "low"
 */
function getRiskLevel(commandType, payload) {
  const ct = String(commandType || "").toUpperCase();
  if (BLOCKED_COMMANDS.has(ct)) return "blocked";
  if (ct === "UPDATE_ORDER_STAGE_SAFE") {
    const targetStage = String((payload && payload.targetStage) || "").toUpperCase();
    if (PRODUCTION_STAGES.has(targetStage)) return "high";
    return "medium";
  }
  if (APPROVAL_REQUIRED_COMMANDS.has(ct)) return "medium";
  if (LOW_RISK_COMMANDS.has(ct)) return "low";
  return "medium";
}

/**
 * Full guardrail evaluation for a command input.
 * Returns { allowed, blocked, reason?, safeAlternative?, requiresApproval, requiresPaymentVerification, riskLevel }
 */
function evaluateCommand(command) {
  const commandType = String((command && command.commandType) || "").toUpperCase();
  const payload = (command && command.payload) || {};
  const approval = command && command.approval;

  if (!commandType) {
    return {
      allowed: false,
      blocked: true,
      reason: "commandType is required and cannot be empty.",
      requiresApproval: false,
      requiresPaymentVerification: false,
      riskLevel: "blocked",
    };
  }

  if (isBlockedCommand(commandType)) {
    return {
      allowed: false,
      blocked: true,
      reason: `Command ${commandType} is permanently blocked. Operator Bridge v1 does not allow customer-facing sends, payment mutations, or destructive actions.`,
      safeAlternative: SAFE_ALTERNATIVES[commandType] || null,
      requiresApproval: false,
      requiresPaymentVerification: false,
      riskLevel: "blocked",
    };
  }

  const needsApproval = requiresApproval(commandType);
  const needsPayment = requiresPaymentVerification(commandType, payload);
  const riskLevel = getRiskLevel(commandType, payload);

  if (needsPayment && (!payload.depositVerified && !payload.paymentVerified)) {
    return {
      allowed: false,
      blocked: true,
      reason: `Command ${commandType} targeting a production stage requires deposit/payment verification. Set payload.depositVerified=true only if Square confirms payment.`,
      requiresApproval: needsApproval,
      requiresPaymentVerification: true,
      riskLevel,
    };
  }

  return {
    allowed: true,
    blocked: false,
    requiresApproval: needsApproval,
    requiresPaymentVerification: needsPayment,
    riskLevel,
    approvalPresent: Boolean(approval && approval.approved),
    approvedBy: (approval && approval.approvedBy) || null,
  };
}

module.exports = {
  evaluateCommand,
  isBlockedCommand,
  requiresApproval,
  requiresPaymentVerification,
  getRiskLevel,
  BLOCKED_COMMANDS,
  APPROVAL_REQUIRED_COMMANDS,
  LOW_RISK_COMMANDS,
};
