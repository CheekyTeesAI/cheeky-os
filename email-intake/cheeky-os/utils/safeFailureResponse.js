"use strict";

/**
 * @typedef {object} SafeFailureOptions
 * @property {string} [safeMessage] Human-readable explanation for Patrick / Jeremy (never stack traces).
 * @property {boolean} [fallbackUsed] True when serving cached or placeholder payload.
 * @property {string} [cachedAt] ISO timestamp of snapshot / attempted operation.
 * @property {string} [technicalCode] Internal non-secret code for grep in logs server-side only.
 * @property {string} [operatorHint] Friendly next step for Jeremy/Patrick when data is partial.
 * @property {string[]} [schemaWarnings] Field-level schema warnings.
 * @property {boolean} [degradedMode] True when endpoint is running in resilience mode.
 * @property {string} [nextRecommendedAction] Practical follow-up step.
 */

/**
 * Standard operator-safe failure envelope. Never attaches `error.stack` or raw connector bodies.
 *
 * @param {SafeFailureOptions} [opts]
 * @returns {{ success: false, safeMessage: string, fallbackUsed: boolean, cachedAt: string, technicalCode: string, operatorHint: string, schemaWarnings: string[], degradedMode: boolean, nextRecommendedAction: string }}
 */
function safeFailureResponse(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  let cachedAt = o.cachedAt;
  try {
    if (!cachedAt) cachedAt = new Date().toISOString();
    else cachedAt = String(cachedAt);
  } catch (_e2) {
    cachedAt = new Date().toISOString();
  }
  return {
    success: false,
    safeMessage:
      typeof o.safeMessage === "string" && o.safeMessage.trim()
        ? String(o.safeMessage).slice(0, 400)
        : "Something interrupted this request. The operator dashboard stays available with safe placeholders.",
    fallbackUsed: !!o.fallbackUsed,
    cachedAt,
    technicalCode:
      typeof o.technicalCode === "string" && o.technicalCode.trim()
        ? String(o.technicalCode).slice(0, 80)
        : "operator_failure",
    operatorHint:
      typeof o.operatorHint === "string" && o.operatorHint.trim()
        ? String(o.operatorHint).slice(0, 220)
        : "Intake queue partially unavailable — showing last known or safe empty data while connectors recover.",
    schemaWarnings: Array.isArray(o.schemaWarnings)
      ? o.schemaWarnings.map((x) => String(x || "").slice(0, 220)).filter(Boolean).slice(0, 20)
      : [],
    degradedMode: o.degradedMode !== false,
    nextRecommendedAction:
      typeof o.nextRecommendedAction === "string" && o.nextRecommendedAction.trim()
        ? String(o.nextRecommendedAction).slice(0, 240)
        : "Check Dataverse schema alignment and retry dashboard refresh.",
  };
}

module.exports = {
  safeFailureResponse,
};
