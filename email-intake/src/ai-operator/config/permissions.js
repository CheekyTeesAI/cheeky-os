"use strict";

/**
 * Static hints for ChatGPT ↔ operator delegation (documentation / future enforcement).
 * Authoritative enforcement lives on each tool.riskLevel in toolRegistry.js.
 */
const INTENT_DEFAULT_RISK = Object.freeze({
  GET_LAST_EMAIL_FROM_CONTACT: "READ_ONLY",
});

const NOTES = Object.freeze([
  "External mutations (send mail, invoicing, production changes, deletes) MUST use APPROVAL_REQUIRED or DANGEROUS tools with human approval workflows — not Phase 1.",
]);

module.exports = { INTENT_DEFAULT_RISK, NOTES };
