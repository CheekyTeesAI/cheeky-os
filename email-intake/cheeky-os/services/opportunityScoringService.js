/**
 * Bundle 37 — deterministic cash-first opportunity scoring (no DB / no AI).
 */

/**
 * @typedef {{
 *   customerName?: string,
 *   customerId?: string,
 *   phone?: string,
 *   email?: string,
 *   amount?: number,
 *   daysOld?: number,
 *   priority?: string,
 *   messageReady?: boolean,
 *   invoiceReady?: boolean,
 *   pricingStatus?: string,
 *   paymentStatus?: string,
 *   recommendedAction?: string,
 *   sourceType?: string,
 * }} OpportunityInput
 */

/**
 * @param {OpportunityInput} input
 * @returns {{ score: number, cashPriority: string, reason: string, flags: string[] }}
 */
function scoreOpportunity(input) {
  const o = input && typeof input === "object" ? input : {};
  const flags = [];
  let score = 0;

  const amount = Number(o.amount) || 0;
  const daysOld = Math.max(0, Math.floor(Number(o.daysOld) || 0));
  const phone = String(o.phone || "").trim();
  const email = String(o.email || "").trim();
  const messageReady = !!o.messageReady;
  const invoiceReady = !!o.invoiceReady;
  const pricingStatus = String(o.pricingStatus || "clear").toLowerCase();
  const paymentStatus = String(o.paymentStatus || "").toLowerCase();
  let recommendedAction = String(o.recommendedAction || "manual_review").toLowerCase();
  const sourceType = String(o.sourceType || "manual").toLowerCase();

  const payPos =
    paymentStatus.includes("deposit") ||
    paymentStatus.includes("prepaid") ||
    paymentStatus.includes("pre-paid") ||
    paymentStatus.includes("paid");
  const payNeg =
    paymentStatus.includes("not_paid") ||
    paymentStatus.includes("not paid") ||
    paymentStatus === "unpaid" ||
    paymentStatus.includes("past_due") ||
    paymentStatus.includes("past due");

  if (amount >= 1000) score += 30;
  else if (amount >= 500) score += 20;
  else if (amount >= 200) score += 10;

  if (phone) {
    score += 10;
  }
  if (email) {
    score += 5;
  }

  if (invoiceReady) {
    score += 20;
    flags.push("invoice_ready");
  }
  if (messageReady) {
    score += 10;
  }

  if (daysOld >= 7) score += 10;
  else if (daysOld >= 3) score += 5;

  if (pricingStatus === "clear") {
    score += 10;
  } else if (pricingStatus === "review") {
    score -= 10;
  } else if (pricingStatus === "blocked") {
    score -= 100;
    flags.push("blocked_by_pricing");
  }

  if (recommendedAction === "create_draft_invoice") {
    score += 15;
  } else if (recommendedAction === "send_followup") {
    score += 10;
    flags.push("needs_followup");
  } else if (recommendedAction === "manual_review") {
    score += 5;
  }

  if (payPos) {
    score += 10;
  } else if (payNeg && !invoiceReady) {
    score -= 10;
  }

  if (sourceType === "response") {
    score += 10;
  } else if (sourceType === "followup") {
    score += 5;
  } else if (sourceType === "reactivation") {
    score += 3;
  }

  if (amount >= 500) {
    flags.push("high_value");
  }
  if (phone || email) {
    flags.push("contactable");
  } else {
    flags.push("weak_contact_data");
  }

  /** @type {"low" | "medium" | "high" | "critical"} */
  let cashPriority = "low";
  if (score >= 60) cashPriority = "critical";
  else if (score >= 40) cashPriority = "high";
  else if (score >= 20) cashPriority = "medium";

  if (pricingStatus === "blocked") {
    cashPriority = "low";
  }

  const reasonParts = [];
  reasonParts.push(`$${Math.round(amount)}`);
  if (phone) reasonParts.push("phone");
  if (email) reasonParts.push("email");
  if (invoiceReady) reasonParts.push("invoice ready");
  if (daysOld > 0) reasonParts.push(`${daysOld} days old`);
  const reason = reasonParts.join(" + ");

  return {
    score: Math.round(score),
    cashPriority,
    reason: reason || "Opportunity",
    flags: Array.from(new Set(flags)),
  };
}

module.exports = {
  scoreOpportunity,
};
