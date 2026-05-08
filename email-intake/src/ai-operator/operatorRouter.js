"use strict";

const path = require("path");

const operatorResponse = require("./operatorResponse");
const { getTool } = require("./toolRegistry");
const { assertExecutionAllowed } = require("./approvalGate");
const { logOperatorAction } = require("./auditLogger");
const { normalizeOperatorInput } = require("./intentEngine");

/** Bridge Layer v1 — recording must never affect operator outcomes */
const EVT = require(path.join(__dirname, "..", "bridge", "eventTypes"));
let recordBridgeEvent = function noopRecord() {};
try {
  const bridgeFacade = require(path.join(__dirname, "..", "bridge", "bridgeRouter"));
  recordBridgeEvent = function bridgeRecordSafe(payload) {
    try {
      bridgeFacade.recordBridgeEvent(payload);
    } catch (_silent) {
      /* never throw */
    }
  };
} catch (_bridgeLoad) {
  recordBridgeEvent = function noopRecord() {};
}

const INTENT_TO_TOOL = Object.freeze({
  GET_LAST_EMAIL_FROM_CONTACT: "getLastEmailFromContact",
});

function hasApprovedFlag(input) {
  if (!input) return false;
  const token = input.approvalToken != null ? String(input.approvalToken).trim() : "";
  if (token.length > 0) return true;
  return Boolean(input.approval === true || input.approved === true);
}

/**
 * Phase 1: non-empty approvalToken satisfies APPROVAL_REQUIRED (validation is a future phase).
 *
 * @param {{ intent: string, params?: object, approvalToken?: string, approval?: boolean, approved?: boolean }} input
 */
async function runOperatorCommand(input) {
  const normalized = normalizeOperatorInput(input || {});
  const intent = normalized.intent;
  const params = normalized.params;

  const approved = hasApprovedFlag(input);
  const t0 = Date.now();

  recordBridgeEvent({
    type: EVT.OPERATOR_COMMAND_RECEIVED,
    source: "ai-operator",
    entityType: "operator",
    entityId: intent,
    actor: "operator-router",
    payload: { intent, params, approved },
    metadata: { layer: "bridge-v1" },
  });

  function finishFailure(code, message, auditExtra) {
    const durationMs = Date.now() - t0;
    logOperatorAction(
      Object.assign(
        {
          intent,
          tool: auditExtra && auditExtra.tool != null ? auditExtra.tool : null,
          params,
          durationMs,
          success: false,
          error: { code: String(code), message: String(message) },
        },
        auditExtra || {}
      )
    );
    return operatorResponse.err(code, message);
  }

  const toolName = INTENT_TO_TOOL[intent];
  if (!toolName) {
    recordBridgeEvent({
      type: EVT.ERROR_RECORDED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: { code: "UNKNOWN_INTENT", intent },
      metadata: { layer: "bridge-v1" },
    });
    return finishFailure(
      "UNKNOWN_INTENT",
      `Unknown intent "${intent}". Supported: ${Object.keys(INTENT_TO_TOOL).join(", ")}.`
    );
  }

  const tool = getTool(toolName);
  if (!tool || typeof tool.handler !== "function") {
    recordBridgeEvent({
      type: EVT.ERROR_RECORDED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: { code: "TOOL_MISSING", intent, tool: toolName },
      metadata: { layer: "bridge-v1" },
    });
    return finishFailure("TOOL_MISSING", `Tool adapter missing or invalid: "${toolName}".`, { tool: toolName });
  }

  if (!tool.enabled) {
    recordBridgeEvent({
      type: EVT.ERROR_RECORDED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: { code: "TOOL_DISABLED", intent, tool: tool.name },
      metadata: { layer: "bridge-v1" },
    });
    return finishFailure("TOOL_DISABLED", `Tool "${tool.name}" is disabled.`, { tool: tool.name });
  }

  const gate = assertExecutionAllowed(tool, { approved });
  if (!gate.allowed) {
    const durationMs = Date.now() - t0;
    logOperatorAction({
      intent,
      tool: tool.name,
      params,
      durationMs,
      success: false,
      error: { code: gate.reason || "BLOCKED", message: gate.message || "Blocked by approval gate." },
      riskLevel: gate.riskLevel,
    });
    recordBridgeEvent({
      type: EVT.APPROVAL_REQUIRED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: { intent, tool: tool.name, reason: gate.reason, message: gate.message },
      metadata: { layer: "bridge-v1", riskLevel: gate.riskLevel },
    });
    return operatorResponse.err(
      gate.reason || "APPROVAL_REQUIRED",
      gate.message || "Blocked by approval gate."
    );
  }

  try {
    const data = await tool.handler(params);
    const durationMs = Date.now() - t0;
    logOperatorAction({
      intent,
      tool: tool.name,
      params,
      durationMs,
      success: true,
      error: undefined,
      riskLevel: tool.riskLevel,
    });
    recordBridgeEvent({
      type: EVT.OPERATOR_TOOL_EXECUTED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: {
        intent,
        tool: tool.name,
        ok: true,
        resultStatus: data && typeof data.status === "string" ? data.status : data && data.status != null ? data.status : null,
      },
      metadata: { durationMs, layer: "bridge-v1" },
    });
    return operatorResponse.ok(data, { intent, tool: tool.name, durationMs });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const durationMs = Date.now() - t0;
    logOperatorAction({
      intent,
      tool: tool.name,
      params,
      durationMs,
      success: false,
      error: { code: "EXECUTION_FAILED", message: msg },
      riskLevel: tool.riskLevel,
    });
    recordBridgeEvent({
      type: EVT.OPERATOR_TOOL_EXECUTED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: { intent, tool: tool.name, ok: false, errorMessage: msg },
      metadata: { durationMs, layer: "bridge-v1" },
    });
    recordBridgeEvent({
      type: EVT.ERROR_RECORDED,
      source: "ai-operator",
      entityType: "operator",
      entityId: intent,
      actor: "operator-router",
      payload: { code: "EXECUTION_FAILED", intent, tool: tool.name, message: msg },
      metadata: { layer: "bridge-v1" },
    });
    return operatorResponse.err("EXECUTION_FAILED", msg);
  }
}

module.exports = { runOperatorCommand, INTENT_TO_TOOL };
