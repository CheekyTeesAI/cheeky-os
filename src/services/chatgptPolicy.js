"use strict";

const READ_ONLY_ACTIONS = new Set([
  "readiness",
  "capabilities",
  "system-status",
  "operator-summary",
  "payments",
  "pipeline",
  "release-queue",
  "vendor-drafts",
]);

const DRAFT_ONLY_ACTIONS = new Set([
  "create-vendor-draft",
  "create-draft-estimate-request",
  "create-draft-invoice-request",
]);

const GUARDED_INTERNAL_ACTIONS = new Set([
  "create-internal-task",
  "evaluate-release",
  "mark-blanks-ordered",
]);

const BLOCKED_ACTIONS = new Set([
  "send-email",
  "send-sms",
  "place-vendor-order",
  "charge-card",
  "auto-send-invoice",
  "mutate-square",
]);

function isReadOnlyAction(actionName) {
  return READ_ONLY_ACTIONS.has(String(actionName || "").toLowerCase());
}

function isDraftOnlyAction(actionName) {
  return DRAFT_ONLY_ACTIONS.has(String(actionName || "").toLowerCase());
}

function isGuardedInternalAction(actionName) {
  return GUARDED_INTERNAL_ACTIONS.has(String(actionName || "").toLowerCase());
}

function isBlockedAction(actionName) {
  return BLOCKED_ACTIONS.has(String(actionName || "").toLowerCase());
}

function canExecuteChatGPTAction(actionName, payload) {
  const name = String(actionName || "").toLowerCase();
  if (isBlockedAction(name)) {
    console.log(`[CHATGPT POLICY] BLOCKED | ${name} | action_blocked_by_default`);
    return { allowed: false, reason: "action_blocked_by_default" };
  }
  if (isReadOnlyAction(name)) {
    return { allowed: true, mode: "read_only" };
  }
  if (isDraftOnlyAction(name)) {
    return { allowed: true, mode: "draft_only" };
  }
  if (isGuardedInternalAction(name)) {
    if (!payload || typeof payload !== "object") {
      console.log(`[CHATGPT POLICY] BLOCKED | ${name} | missing_payload`);
      return { allowed: false, reason: "missing_payload" };
    }
    return { allowed: true, mode: "guarded_internal" };
  }
  console.log(`[CHATGPT POLICY] BLOCKED | ${name} | unknown_action`);
  return { allowed: false, reason: "unknown_action" };
}

module.exports = {
  canExecuteChatGPTAction,
  isReadOnlyAction,
  isDraftOnlyAction,
  isGuardedInternalAction,
  isBlockedAction,
};
