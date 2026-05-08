"use strict";

/**
 * Phase 3 placeholder — 72-hour deposit nudge policy (not wired to scheduler yet).
 *
 * Planned behavior:
 * - Find intake rows ct_status IN (INVOICE_SENT, DEPOSIT_PENDING) AND ct_deposit_paid=false
 *   AND invoice created >72h ago (requires timestamp column like ct_invoice_sent_at; add in Dataverse when ready).
 * - Queue customer comms draft or Power Automate trigger.
 *
 * Env (future): CHEEKY_DEPOSIT_NUDGE_HOURS default 72
 */

const POLICY_SUMMARY =
  "After INVOICE_SENT with unpaid deposit beyond 72h — nudge via comms/automation (not implemented yet).";

function getDepositNudgePolicySummary() {
  return {
    placeholder: true,
    hours: Number(process.env.CHEEKY_DEPOSIT_NUDGE_HOURS || "72") || 72,
    summary: POLICY_SUMMARY,
  };
}

module.exports = { getDepositNudgePolicySummary };
