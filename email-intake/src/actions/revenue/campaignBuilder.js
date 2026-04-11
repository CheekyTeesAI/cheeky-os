/**
 * Campaign assignment helper.
 */
"use strict";

function assignCampaignType(score, lastOrderDaysAgo) {
  const age = Number(lastOrderDaysAgo || 0);
  if (score >= 80) return "fast-close";
  if (age <= 30) return "restock";
  if (age <= 120) return "reintro";
  return "winback";
}

module.exports = { assignCampaignType };
