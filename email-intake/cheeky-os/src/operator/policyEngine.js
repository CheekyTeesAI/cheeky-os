"use strict";

module.exports = function policyEngine(input = {}) {
  try {
    const result = {
      allowed: true,
      blocked: false,
      reasons: [],
    };

    const action = input.action || "";
    const data = input.data || {};

    // 1. BLOCK EMAIL SEND IF MISSING EMAIL
    if (action === "SEND_EMAIL" && !data.to) {
      result.allowed = false;
      result.blocked = true;
      result.reasons.push("Missing recipient email");
    }

    // 2. BLOCK QUOTE IF QUANTITY MISSING OR INVALID
    if (action === "GENERATE_QUOTE") {
      if (!data.quantity || Number(data.quantity) <= 0) {
        result.allowed = false;
        result.blocked = true;
        result.reasons.push("Missing or invalid quantity");
      }
    }

    // 3. BLOCK TASK ADVANCE IF TASK ID MISSING
    if (action === "ADVANCE_TASK" && !data.taskId) {
      result.allowed = false;
      result.blocked = true;
      result.reasons.push("Missing taskId");
    }

    // 4. BLOCK AUTO CLOSE DEAL
    if (action === "CLOSE_DEAL_AUTOMATICALLY") {
      result.allowed = false;
      result.blocked = true;
      result.reasons.push("Auto-closing deals is not allowed");
    }

    // 5. BLOCK AUTO FOLLOW-UP IF FEATURE FLAG OFF
    if (action === "AUTO_FOLLOWUP" && process.env.AUTO_FOLLOWUP !== "true") {
      result.allowed = false;
      result.blocked = true;
      result.reasons.push("AUTO_FOLLOWUP disabled");
    }

    return result;
  } catch (err) {
    return {
      allowed: false,
      blocked: true,
      reasons: ["Policy engine error: " + (err && err.message ? err.message : String(err))],
    };
  }
};
