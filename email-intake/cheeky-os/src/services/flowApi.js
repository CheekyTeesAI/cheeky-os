"use strict";

const { canExecuteIntent } = require("./capabilityDetector");
const { generateProcessManifest } = require("./processManifestor");
const { buildFlowFromManifest } = require("./flowBuilder");
const { generateCursorBuildPrompt } = require("./buildPromptGenerator");
const { createBuildRecord, updateBuildStatus, getBuildStatus } = require("./buildTracker");

const { parseMobileIntent } = require("./mobileIntentParser");

const INTENT_ALIASES = {
  "send follow-ups": "auto_send_customer_followups",
  "send follow ups": "auto_send_customer_followups",
  "auto follow-up customers": "auto_send_customer_followups",
  "auto follow up customers": "auto_send_customer_followups",
  "send customer follow-ups": "auto_send_customer_followups",
  "send customer follow ups": "auto_send_customer_followups",
  "send customer follow-ups automatically": "auto_send_customer_followups",
};

function normalizeAliasedIntent(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (INTENT_ALIASES[t]) return INTENT_ALIASES[t];
  return t;
}

function resolveIntentFromBody(body) {
  if (body && body.intent && String(body.intent).trim()) {
    return { intent: normalizeAliasedIntent(String(body.intent).trim().toLowerCase()), from: "body.intent" };
  }
  if (body && body.text) {
    const parsed = parseMobileIntent(String(body.text).trim());
    return { intent: normalizeAliasedIntent(String(parsed.intent || "unknown")), from: "parsed", parsed };
  }
  return { intent: "unknown", from: "empty" };
}

/**
 * @param {object} body
 */
function planFromRequest(body) {
  const { intent, from, parsed } = resolveIntentFromBody(body || {});
  const cap = canExecuteIntent(intent);
  if (cap.executable) {
    return {
      executable: true,
      reason: cap.reason,
      missing: cap.missing,
      intent,
      from,
      manifest: null,
      flow: null,
      buildPrompt: null,
      buildId: null,
      nextStep: "execute",
    };
  }
  const context = {
    rawText: body && body.text ? String(body.text) : null,
    source: "flow/plan",
    parseMeta: from === "parsed" && parsed ? { confidence: parsed.confidence } : null,
  };
  const manifest = generateProcessManifest(intent, context);
  const flow = buildFlowFromManifest(manifest);
  const buildPrompt = generateCursorBuildPrompt(manifest, flow);
  const rec = createBuildRecord(manifest);
  return {
    executable: false,
    reason: cap.reason,
    missing: cap.missing,
    intent,
    from,
    manifest,
    flow,
    buildPrompt,
    buildId: rec.id,
    nextStep: "approve_build",
  };
}

function approveBuildRequest(body) {
  const id = body && (body.buildId || body.id) ? String(body.buildId || body.id) : "";
  if (!id) {
    return { success: false, error: "missing_build_id" };
  }
  const updated = updateBuildStatus(id, "approved");
  if (!updated) {
    return { success: false, error: "build_not_found" };
  }
  const manifest = updated.manifest;
  const flow = buildFlowFromManifest(manifest);
  const buildPrompt = generateCursorBuildPrompt(manifest, flow);
  return {
    success: true,
    build: updated,
    buildPrompt,
    nextStep: "build_and_verify_locally",
  };
}

function statusResponse(id) {
  const b = getBuildStatus(id);
  if (!b) {
    return { success: false, error: "not_found" };
  }
  return {
    success: true,
    build: b,
    executionReadiness: {
      canAutoExecute: false,
      requiredStatus: "verified",
      currentStatus: b.status,
      message: "Execution is disabled until build is verified; no auto code run.",
    },
  };
}

module.exports = {
  planFromRequest,
  approveBuildRequest,
  statusResponse,
  resolveIntentFromBody,
  normalizeAliasedIntent,
};
