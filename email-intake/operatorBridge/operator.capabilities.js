"use strict";

/**
 * Operator Bridge — Capabilities Registry
 * Defines what the bridge can and cannot do.
 */

const ALLOWED_COMMANDS = [
  {
    type: "READ_STATUS",
    description: "Read live system and order status snapshot.",
    requiresApproval: false,
    requiresPaymentVerification: false,
    riskLevel: "low",
  },
  {
    type: "SUMMARIZE_OPEN_ORDERS",
    description: "Return a summary of open orders with stage and deposit status.",
    requiresApproval: false,
    requiresPaymentVerification: false,
    riskLevel: "low",
  },
  {
    type: "FIND_ORDER",
    description: "Search for a specific order by name, ID, or email.",
    requiresApproval: false,
    requiresPaymentVerification: false,
    riskLevel: "low",
  },
  {
    type: "CREATE_INTERNAL_TASK",
    description: "Create an internal staff task (not customer-facing). No email/SMS sent.",
    requiresApproval: false,
    requiresPaymentVerification: false,
    riskLevel: "low",
  },
  {
    type: "ADD_ORDER_NOTE",
    description: "Append an internal note to an existing order.",
    requiresApproval: false,
    requiresPaymentVerification: false,
    riskLevel: "low",
  },
  {
    type: "RECOMMEND_NEXT_ACTIONS",
    description: "Generate a list of recommended next business actions based on current state.",
    requiresApproval: false,
    requiresPaymentVerification: false,
    riskLevel: "low",
  },
  {
    type: "DRAFT_CUSTOMER_FOLLOWUP",
    description: "Create a draft customer follow-up message. Not sent automatically — requires operator review.",
    requiresApproval: true,
    requiresPaymentVerification: false,
    riskLevel: "medium",
  },
  {
    type: "DRAFT_ESTIMATE_REQUEST",
    description: "Create a draft estimate. Not sent automatically — requires operator review.",
    requiresApproval: true,
    requiresPaymentVerification: false,
    riskLevel: "medium",
  },
  {
    type: "DRAFT_INVOICE_REQUEST",
    description: "Create a draft invoice request. Not sent automatically — requires operator review.",
    requiresApproval: true,
    requiresPaymentVerification: false,
    riskLevel: "medium",
  },
  {
    type: "UPDATE_ORDER_STAGE_SAFE",
    description: "Advance an order to the next stage. Production stages require deposit verification and operator approval.",
    requiresApproval: true,
    requiresPaymentVerification: true,
    riskLevel: "medium",
  },
];

const BLOCKED_COMMANDS = [
  { type: "SEND_EMAIL", reason: "No auto-send. Use DRAFT_CUSTOMER_FOLLOWUP." },
  { type: "SEND_SMS", reason: "No auto-send. Use DRAFT_CUSTOMER_FOLLOWUP." },
  { type: "SEND_INVOICE", reason: "No auto-send. Use DRAFT_INVOICE_REQUEST." },
  { type: "SEND_ESTIMATE", reason: "No auto-send. Use DRAFT_ESTIMATE_REQUEST." },
  { type: "MARK_PAID", reason: "Square is the financial source of truth. Never fake payment status." },
  { type: "ORDER_BLANKS", reason: "Requires verified deposit and manual operator action." },
  { type: "MOVE_TO_PRODUCTION_WITHOUT_DEPOSIT", reason: "Cash protection: deposit must be verified first." },
  { type: "DELETE_ORDER", reason: "Destructive action blocked in Operator Bridge v1." },
  { type: "DELETE_CUSTOMER", reason: "Destructive action blocked in Operator Bridge v1." },
  { type: "DELETE_PAYMENT", reason: "Destructive action blocked in Operator Bridge v1." },
  { type: "REFUND_PAYMENT", reason: "Destructive action blocked in Operator Bridge v1." },
];

const OPERATOR_RULES = [
  "No customer-facing messages (email, SMS, invoice, estimate) are sent automatically.",
  "Draft-only behavior by default for all outreach and financial documents.",
  "Payment and deposit status must be verified via Square before any production actions.",
  "Every command preview and execute is audited with timestamp, requestedBy, and result.",
  "Fail closed: if uncertain or guardrail cannot be evaluated, the command is blocked.",
  "Square is the financial source of truth — the bridge never marks orders paid.",
  "Destructive actions (delete, refund) are permanently blocked in Operator Bridge v1.",
];

function getCapabilities() {
  return {
    ok: true,
    version: "1.0.0",
    allowedCommands: ALLOWED_COMMANDS,
    blockedCommands: BLOCKED_COMMANDS,
    rules: OPERATOR_RULES,
  };
}

module.exports = {
  getCapabilities,
  ALLOWED_COMMANDS,
  BLOCKED_COMMANDS,
  OPERATOR_RULES,
};
