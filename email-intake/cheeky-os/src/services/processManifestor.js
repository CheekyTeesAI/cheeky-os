"use strict";

const crypto = require("crypto");
const { getMissingCapabilities } = require("./capabilityDetector");

function generateId() {
  return `man-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function defaultSteps(intent) {
  const i = String(intent || "").toLowerCase();
  if (i === "auto_send_customer_followups" || i === "send_follow_ups_batch") {
    return [
      { name: "detect", detail: "Identify orders/leads eligible under policy" },
      { name: "prepare", detail: "Build drafts, dedupe, set cooldown" },
      { name: "gate", detail: "Approval or FOLLOWUP_AUTO_SEND if enabled" },
      { name: "audit", detail: "Log to audit and SendLog" },
    ];
  }
  return [
    { name: "detect", detail: "Validate inputs and load entities" },
    { name: "prepare", detail: "Apply policy" },
    { name: "execute", detail: "Run allowed side effects only" },
    { name: "audit", detail: "Record outcome" },
  ];
}

/**
 * @param {string} intent
 * @param {object} context
 */
function generateProcessManifest(intent, context) {
  const i = String(intent || "").toLowerCase();
  const { missing, reason: missReason } = getMissingCapabilities(i);
  const isOutbound = /follow/.test(i);

  return {
    id: generateId(),
    intent: i,
    missingCapabilities: missing,
    requiredFlows: isOutbound
      ? ["outbound_followup_pipeline", "scheduler_or_manual_run", "duplicate_guard"]
      : ["policy_gate", "action_audit", "idempotency"],
    requiredRoutes: isOutbound
      ? ["POST /api/operator/… or existing followup run (guarded)"]
      : ["Existing guarded routes as applicable"],
    requiredServices: isOutbound
      ? ["followupPolicy", "followupTemplates", "followupAutomation (or equivalent)", "sendEmailAction (guarded)"]
      : ["policy engine", "audit log"],
    requiredData: isOutbound
      ? ["RevenueFollowup", "SendLog", "order/lead contact truth"]
      : ["Entity records referenced by the intent"],
    riskLevel: isOutbound ? "high" : "medium",
    executionType: isOutbound ? "external_action" : "internal_action",
    buildRequired: true,
    description: `Close gap for "${i}": ${missReason || "unimplemented"}`,
    steps: defaultSteps(i),
    timestamp: new Date().toISOString(),
    context: context && typeof context === "object" ? { rawText: context.rawText || null, source: context.source || null } : {},
  };
}

module.exports = {
  generateProcessManifest,
};
