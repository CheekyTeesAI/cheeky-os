"use strict";

module.exports = function scoreLead(customer = {}, order = {}) {
  try {
    let score = 0;

    // ORDER SIZE
    if (order.quantity >= 100) score += 30;
    else if (order.quantity >= 50) score += 20;
    else if (order.quantity >= 24) score += 10;

    // CUSTOMER TYPE
    const name = String(customer.name || "").toLowerCase();

    if (name.includes("school")) score += 25;
    if (name.includes("church")) score += 15;
    if (name.includes("hvac") || name.includes("construction")) score += 20;

    // REPEAT CUSTOMER
    if (customer.orderCount > 2) score += 20;

    // TIME WASTER FILTER
    if (order.quantity < 6) score -= 20;

    // CAP
    if (score > 100) score = 100;

    let tier = "LOW";
    if (score >= 70) tier = "HIGH";
    else if (score >= 40) tier = "MEDIUM";

    return {
      score,
      tier,
    };
  } catch (_) {
    return {
      score: 0,
      tier: "LOW",
    };
  }
};
