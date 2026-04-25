"use strict";

const READ_INTENTS = new Set([
  "get_system_status",
  "get_operator_summary",
  "get_unpaid_deposits",
  "get_stuck_production",
  "get_release_queue",
  "get_vendor_drafts",
  "get_top_priorities",
  "get_cash_snapshot",
  "get_runway",
  "get_cash_attention",
  "get_obligations_due_soon",
]);

const SAFE_ACTION_INTENTS = new Set([
  "create_internal_task",
  "evaluate_release",
  "create_vendor_draft",
  "run_decision_engine",
]);

const BLOCKED_INTENTS = new Set([
  "send_customer_message",
  "place_vendor_order",
  "send_invoice",
  "charge_card",
  "mark_paid_manually",
  "make_payment",
  "charge_customer",
  "borrow_money",
]);

function isReadIntent(intent) {
  return READ_INTENTS.has(String(intent || "").toLowerCase());
}

function isSafeActionIntent(intent) {
  return SAFE_ACTION_INTENTS.has(String(intent || "").toLowerCase());
}

function isBlockedIntent(intent) {
  return BLOCKED_INTENTS.has(String(intent || "").toLowerCase());
}

function canRunMobileCommand(intent, _payload) {
  const i = String(intent || "").toLowerCase();
  if (!i) {
    console.log("[MOBILE POLICY] BLOCKED | unknown | missing_intent");
    return { allowed: false, reason: "missing_intent" };
  }
  if (isBlockedIntent(i)) {
    console.log(`[MOBILE POLICY] BLOCKED | ${i} | blocked_in_mobile_mode`);
    return { allowed: false, reason: "blocked_in_mobile_mode" };
  }
  if (isReadIntent(i) || isSafeActionIntent(i)) {
    return { allowed: true };
  }
  console.log(`[MOBILE POLICY] BLOCKED | ${i} | unsupported_intent`);
  return { allowed: false, reason: "unsupported_intent" };
}

module.exports = {
  canRunMobileCommand,
  isReadIntent,
  isSafeActionIntent,
  isBlockedIntent,
};
