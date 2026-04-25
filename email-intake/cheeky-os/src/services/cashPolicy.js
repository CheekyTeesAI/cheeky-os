"use strict";

function classifyMoneySignal(value, sourceType) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return { value: null, certainty: "unknown", sourceType: sourceType || "unknown" };
  }
  const numeric = Number(value);
  const source = String(sourceType || "").toLowerCase();
  if (source === "actual") return { value: numeric, certainty: "actual", sourceType: "actual" };
  if (source === "estimated") return { value: numeric, certainty: "estimated", sourceType: "estimated" };
  return { value: numeric, certainty: "unknown", sourceType: sourceType || "unknown" };
}

function getCashMode() {
  const mode = String(process.env.CASH_ENGINE_MODE || "analysis_only").toLowerCase();
  if (mode === "analysis_only") return "analysis_only";
  return "analysis_only";
}

function canRecommendCashAction(actionType) {
  const allowed = new Set([
    "collect_deposit",
    "prioritize_invoice_followup",
    "delay_nonessential_spend",
    "review_vendor_commitment",
    "flag_runway_risk",
  ]);
  return allowed.has(String(actionType || "").toLowerCase());
}

function canExecuteCashAction(actionType) {
  const blocked = new Set([
    "make_payment",
    "charge_customer",
    "borrow_funds",
    "reorder_inventory",
    "auto_approve_spend",
  ]);
  const action = String(actionType || "").toLowerCase();
  if (blocked.has(action)) {
    console.log(`[CASH POLICY] BLOCKED | ${action} | blocked_in_this_phase`);
    return false;
  }
  return false;
}

module.exports = {
  classifyMoneySignal,
  canRecommendCashAction,
  canExecuteCashAction,
  getCashMode,
};
