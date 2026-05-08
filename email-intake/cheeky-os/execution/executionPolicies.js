"use strict";

/**
 * Capability → execution posture. Human approval mandatory for externally visible mutations.
 */

const READ_ONLY = "READ_ONLY";
const APPROVAL_REQUIRED = "APPROVAL_REQUIRED";
const BLOCKED = "BLOCKED";

/**
 * @param {string} capability shell|financial|communication|production|build|query
 * @returns {string}
 */
function policyForCapability(capability) {
  try {
    const c = String(capability || "").trim().toLowerCase();
    if (!c || c === "query" || c === "readonly" || c === "diagnostics") return READ_ONLY;

    if (c === "shell" || c === "execute") return APPROVAL_REQUIRED;
    if (c === "financial") return APPROVAL_REQUIRED;
    if (c === "communication") return APPROVAL_REQUIRED;
    if (c === "production") return APPROVAL_REQUIRED;
    if (c === "build") return APPROVAL_REQUIRED;

    return BLOCKED;
  } catch (_e) {
    return BLOCKED;
  }
}

/**
 * Intent string from operator/console → coarse capability bucket.
 */
function classifyExecutionCapabilityFromTask(taskLike) {
  try {
    const t = taskLike && typeof taskLike === "object" ? taskLike : {};
    const intent = String(t.intent || "").trim().toLowerCase();

    if (intent === "query") return "query";
    if (intent === "execute") return "shell";
    if (intent === "notify") return "communication";
    if (intent === "build") return "build";

    const tgt = `${t.target || ""} ${(t.requirements || []).join(" ")}`.toLowerCase();
    if (/invoice|deposit|billing|collections|financial|square payout/.test(tgt)) return "financial";
    if (/production|routing|purchase order garment|inventory commit|qc/.test(tgt)) return "production";

    return "blocked";
  } catch (_e) {
    return "blocked";
  }
}

module.exports = {
  READ_ONLY,
  APPROVAL_REQUIRED,
  BLOCKED,
  policyForCapability,
  classifyExecutionCapabilityFromTask,
};
