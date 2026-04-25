"use strict";

module.exports = function routingEngine(input = {}) {
  try {
    const qty = Number(input.quantity || 0);
    const garment = String(input.garment || "").toLowerCase();

    let method = "DTG";

    // HARD RULES
    if (qty >= 24) method = "SCREEN_PRINT";
    if (garment.includes("poly")) method = "DTF";
    if (qty >= 12 && qty < 24) method = "DTG";

    return {
      method,
      reasoning: `Selected ${method} based on quantity (${qty}) and garment`,
    };
  } catch (_) {
    return {
      method: "DTG",
      reasoning: "Fallback routing",
    };
  }
};
