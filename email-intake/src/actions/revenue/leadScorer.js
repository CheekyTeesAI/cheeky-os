/**
 * Lead scorer for manual + merged outreach inputs.
 */
"use strict";

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function scoreLead(customer) {
  const spend = Number(customer.totalSpent || 0);
  const age = Number(customer.lastOrderDaysAgo || 0);
  let score = 50;
  score += Math.min(25, Math.floor(spend / 200));
  score -= Math.min(25, Math.floor(age / 15));
  score = clamp(score, 0, 100);
  let tier = "DORMANT";
  if (score >= 75) tier = "HOT";
  else if (score >= 50) tier = "WARM";
  else if (score >= 25) tier = "COLD";
  return { score, tier };
}

module.exports = { scoreLead };
