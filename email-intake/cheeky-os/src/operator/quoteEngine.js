"use strict";

module.exports = function generateQuote(quantity = 0) {
  try {
    let pricePerShirt = 20;
    const qty = Number(quantity || 0);

    if (qty >= 100) pricePerShirt = 10;
    else if (qty >= 50) pricePerShirt = 12;
    else if (qty >= 24) pricePerShirt = 15;

    const total = qty * pricePerShirt;

    return {
      quantity: qty,
      pricePerShirt,
      total,
    };
  } catch (_) {
    return {
      quantity: 0,
      pricePerShirt: 0,
      total: 0,
    };
  }
};
