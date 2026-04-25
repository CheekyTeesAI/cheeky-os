"use strict";

const BLOCKED_DECISIONS = new Set([
  "send_external_message",
  "place_vendor_order",
  "send_invoice",
  "mutate_square",
  "mark_paid_manually",
  "advance_to_printing",
  "advance_to_qc",
  "advance_to_completed",
]);

const AUTO_ALLOWED_DECISIONS = new Set([
  "create_internal_task",
  "advance_to_safe_review_state",
  "create_vendor_draft_if_already_approved_by_existing_policy",
]);

function getDecisionMode() {
  const raw = String(process.env.DECISION_ENGINE_MODE || "recommend_only").toLowerCase();
  if (raw === "controlled_internal_actions") return "controlled_internal_actions";
  return "recommend_only";
}

function canRecommend(_decisionType) {
  return true;
}

function isBlockedDecision(decisionType) {
  const d = String(decisionType || "").toLowerCase();
  return BLOCKED_DECISIONS.has(d);
}

function canAutoDecide(decisionType) {
  if (getDecisionMode() !== "controlled_internal_actions") return false;
  return AUTO_ALLOWED_DECISIONS.has(String(decisionType || "").toLowerCase());
}

function canExecuteInternalAction(actionType) {
  const a = String(actionType || "").toLowerCase();
  if (isBlockedDecision(a)) {
    console.log(`[DECISION POLICY] BLOCKED | ${a} | blocked_in_this_phase`);
    return false;
  }
  if (getDecisionMode() !== "controlled_internal_actions") return false;
  return AUTO_ALLOWED_DECISIONS.has(a);
}

module.exports = {
  canRecommend,
  canAutoDecide,
  canExecuteInternalAction,
  isBlockedDecision,
  getDecisionMode,
};
