/**
 * Bundle 51 — deterministic retargeting score (no AI, no DB).
 */

/**
 * @param {{
 *   customerName?: string,
 *   phone?: string,
 *   email?: string,
 *   amount?: number,
 *   daysSinceLastContact?: number,
 *   lastStatus?: string,
 *   sourceType?: string,
 *   hasOrder?: boolean
 * }} input
 * @returns {{
 *   score: number,
 *   retargetPriority: "low"|"medium"|"high"|"critical",
 *   reason: string,
 *   flags: string[]
 * } | null}
 */
function scoreRetargetingCandidate(input) {
  const src = input && typeof input === "object" ? input : {};
  if (src.hasOrder === true) return null;

  const amount = Math.max(0, Number(src.amount) || 0);
  const days = Math.max(0, Math.floor(Number(src.daysSinceLastContact) || 0));
  const phone = String(src.phone || "").trim();
  const email = String(src.email || "").trim();
  const lastStatus = String(src.lastStatus || "").toLowerCase().trim();
  const sourceType = String(src.sourceType || "").toLowerCase().trim();

  /** @type {string[]} */
  const flags = [];

  let score = 0;
  if (amount >= 1000) {
    score += 25;
    flags.push("value_1k_plus");
  } else if (amount >= 500) {
    score += 15;
    flags.push("value_500_plus");
  } else if (amount >= 200) {
    score += 10;
    flags.push("value_200_plus");
  }

  if (days >= 7) {
    score += 20;
    flags.push("gap_7d");
  } else if (days >= 3) {
    score += 10;
    flags.push("gap_3d");
  }

  if (phone) {
    score += 10;
    flags.push("has_phone");
  }
  if (email) {
    score += 5;
    flags.push("has_email");
  }

  if (lastStatus === "not_now") {
    score += 15;
    flags.push("status_not_now");
  } else if (lastStatus === "stale") {
    score += 10;
    flags.push("status_stale");
  } else if (lastStatus === "no_response") {
    score += 5;
    flags.push("status_no_response");
  }

  if (sourceType === "quote") {
    score += 10;
    flags.push("source_quote");
  } else if (sourceType === "lead") {
    score += 5;
    flags.push("source_lead");
  }

  /** @type {"low"|"medium"|"high"|"critical"} */
  let retargetPriority = "low";
  if (score >= 50) retargetPriority = "critical";
  else if (score >= 35) retargetPriority = "high";
  else if (score >= 20) retargetPriority = "medium";

  const reason = buildRetargetReason(amount, days, lastStatus, sourceType);

  return {
    score,
    retargetPriority,
    reason,
    flags,
  };
}

/**
 * @param {number} amount
 * @param {number} days
 * @param {string} lastStatus
 * @param {string} sourceType
 * @returns {string}
 */
function buildRetargetReason(amount, days, lastStatus, sourceType) {
  const parts = [];
  if (amount >= 200) parts.push(`$${Math.round(amount)}`);
  if (days >= 7) parts.push(`${days} days`);
  else if (days >= 3) parts.push(`${days} days`);
  else if (days > 0) parts.push(`${days} days`);
  if (lastStatus) parts.push(lastStatus.replace(/_/g, " "));
  if (sourceType && sourceType !== "customer") parts.push(sourceType);
  return parts.length ? parts.join(" + ") : "retarget candidate";
}

/**
 * @param {string} message
 * @param {number} days
 * @returns {"not_now"|"stale"|"no_response"}
 */
function inferLeadLastStatus(message, days) {
  const m = String(message || "").toLowerCase();
  if (
    /\bnot now\b/.test(m) ||
    /\bnot\s+right now\b/.test(m) ||
    /\bcheck back\b/.test(m)
  ) {
    return "not_now";
  }
  if (days >= 14) return "stale";
  return "no_response";
}

module.exports = {
  scoreRetargetingCandidate,
  buildRetargetReason,
  inferLeadLastStatus,
};
