"use strict";

/** @typedef {"READ_ONLY" | "APPROVAL_REQUIRED" | "DANGEROUS"} RiskLevel */

const RISK_LEVEL = Object.freeze({
  READ_ONLY: "READ_ONLY",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  DANGEROUS: "DANGEROUS",
});

/**
 * Phase 1: READ_ONLY passes; APPROVAL_REQUIRED passes only when options.approved;
 * DANGEROUS always blocked until a future approval workflow exists.
 *
 * @param {{ name?: string, riskLevel?: RiskLevel }} tool
 * @param {{ approved?: boolean }} options
 */
function assertExecutionAllowed(tool, options = {}) {
  const approved = Boolean(options.approved);
  const level = tool && tool.riskLevel ? tool.riskLevel : RISK_LEVEL.APPROVAL_REQUIRED;

  if (level === RISK_LEVEL.DANGEROUS) {
    return {
      allowed: false,
      riskLevel: level,
      reason: "DANGEROUS_BLOCKED",
      message:
        `Tool "${tool && tool.name ? tool.name : "unknown"}" is blocked in Phase 1 (DANGEROUS tier is not executable yet).`,
    };
  }

  if (level === RISK_LEVEL.READ_ONLY) {
    return { allowed: true, riskLevel: level };
  }

  if (level === RISK_LEVEL.APPROVAL_REQUIRED && approved) {
    return { allowed: true, riskLevel: level };
  }

  return {
    allowed: false,
    riskLevel: level,
    reason: "APPROVAL_REQUIRED",
    message: `Tool "${tool && tool.name ? tool.name : "unknown"}" requires explicit approval before execution.`,
  };
}

module.exports = { RISK_LEVEL, assertExecutionAllowed };
