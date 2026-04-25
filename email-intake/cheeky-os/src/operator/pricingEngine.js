"use strict";

module.exports = function pricingEngine(input = {}, routing = {}) {
  try {
    const qty = Number(input.quantity || 0);

    const blankCost = 4; // Gildan avg
    const printCost = routing.method === "SCREEN_PRINT" ? 6 : 4;
    const overhead = 1;

    const cost = blankCost + printCost + overhead;

    // MARGIN RULES (LOCKED)
    let margin = 0.5;

    if (qty >= 100) margin = 0.4;
    if (qty >= 250) margin = 0.3;
    if (qty >= 500) margin = 0.2;

    const pricePerShirt = qty > 0 ? cost / (1 - margin) : 0;
    const total = Math.round(pricePerShirt * qty);

    return {
      cost,
      margin,
      pricePerShirt: Math.round(pricePerShirt),
      total,
    };
  } catch (_) {
    return {
      cost: 0,
      margin: 0,
      pricePerShirt: 0,
      total: 0,
    };
  }
};
