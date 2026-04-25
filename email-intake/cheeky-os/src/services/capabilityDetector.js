"use strict";

/**
 * Which intents the current mobile/ChatGPT operator surface can actually execute.
 * Unlisted or explicit future intents are not executable here.
 */
const IMPLEMENTED_INTENTS = new Set([
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
  "create_internal_task",
  "evaluate_release",
  "create_vendor_draft",
  "run_decision_engine",
]);

/** Intents that are understood but not implemented in this build (manifest path). */
const UNIMPLEMENTED_PLANNABLE = new Set(["auto_send_customer_followups", "send_follow_ups_batch"]);

function canExecuteIntent(intent) {
  const i = String(intent || "").toLowerCase();
  if (!i) {
    return { executable: false, missing: ["intent_unknown"], reason: "empty_intent" };
  }
  if (UNIMPLEMENTED_PLANNABLE.has(i)) {
    return { executable: false, missing: getMissingCapabilities(i).missing, reason: "capability_not_implemented" };
  }
  if (IMPLEMENTED_INTENTS.has(i)) {
    return { executable: true, missing: [], reason: "implemented" };
  }
  return { executable: false, missing: ["operator_surface_not_registered"], reason: "intent_not_supported" };
}

function getMissingCapabilities(intent) {
  const i = String(intent || "").toLowerCase();
  if (i === "auto_send_customer_followups" || i === "send_follow_ups_batch") {
    return {
      missing: [
        "Follow-up policy + cooldown matrix",
        "Scheduler or cron tick (or explicit on-demand run route)",
        "Message templates and duplicate suppression",
        "Send pipeline (draft → approval) or draft-only log",
        "actionAudit + audit id on every follow-up",
        "Idempotency keys to prevent infinite loops",
      ],
      reason: "external_outbound_not_wired",
    };
  }
  if (!i) {
    return { missing: ["intent"], reason: "empty_intent" };
  }
  return { missing: ["unknown_capability"], reason: "intent_not_supported" };
}

function isPlannableUnimplementedIntent(intent) {
  return UNIMPLEMENTED_PLANNABLE.has(String(intent || "").toLowerCase());
}

function isImplementedIntent(intent) {
  return IMPLEMENTED_INTENTS.has(String(intent || "").toLowerCase());
}

module.exports = {
  canExecuteIntent,
  getMissingCapabilities,
  isPlannableUnimplementedIntent,
  isImplementedIntent,
  IMPLEMENTED_INTENTS,
  UNIMPLEMENTED_PLANNABLE,
};
