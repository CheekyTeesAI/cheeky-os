/**
 * Simple escalation rules — no ML.
 */
const { listCommunications } = require("./communicationService");

const NEGATIVE = /\b(angry|furious|terrible|worst|sue|lawyer|refund\s+now|never\s+order|disgusted|unacceptable)\b/i;
const URGENT = /\b(urgent|asap|immediately|today\s+or|lawyer|chargeback)\b/i;
const PRICING = /\b(discount|price\s+match|cheaper|deal|negotiate|quote\s+too\s+high)\b/i;
const RUSH = /\b(tomorrow|same\s+day|need\s+it\s+now|rush)\b/i;
const DISPUTE = /\b(dispute|chargeback|fraud|didn'?t\s+authorize|wrong\s+charge)\b/i;

function evaluateEscalation(serviceDeskItem) {
  const item = serviceDeskItem && typeof serviceDeskItem === "object" ? serviceDeskItem : {};
  const text = `${item.summary || ""} ${item.textSnippet || ""} ${item.latestResponsePreview || ""}`;
  const reasons = [];

  if (NEGATIVE.test(text) || URGENT.test(text)) {
    reasons.push("negative_or_urgent_language");
  }
  if (PRICING.test(text)) {
    reasons.push("pricing_or_negotiation");
  }
  if (RUSH.test(text)) {
    reasons.push("rush_or_impossible_deadline_risk");
  }
  if (DISPUTE.test(text)) {
    reasons.push("payment_dispute_language");
  }

  if (!item.customerId && /EMAIL|SMS|WEB/i.test(String(item.source)) && !item.relatedId) {
    reasons.push("missing_customer_link");
  }

  try {
    const fails = listCommunications({ status: "FAILED", relatedId: item.relatedId, limit: 20 });
    if (fails.length >= 2) reasons.push("multiple_failed_communications");
  } catch (_e) {
    /* ignore */
  }

  if (String(item.priority || "").toUpperCase() === "URGENT") {
    reasons.push("marked_urgent");
  }

  let targetRole = "OWNER";
  if (reasons.some((r) => r.includes("printer") || r.includes("production"))) targetRole = "PRINTER";
  if (reasons.length === 1 && reasons[0] === "missing_customer_link") targetRole = "ADMIN";

  const escalate = reasons.length > 0;

  return {
    escalate,
    reason: escalate ? reasons.join("; ") : null,
    targetRole,
    reasons,
  };
}

module.exports = { evaluateEscalation };
