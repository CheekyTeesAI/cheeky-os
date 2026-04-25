"use strict";

function calculatePrice(quantity) {
  const qty = Math.max(1, Number(quantity || 1) || 1);
  const baseCost = 6;
  let margin = 0.45;

  if (qty >= 100) margin = 0.40;
  if (qty >= 250) margin = 0.30;

  const pricePer = baseCost / (1 - margin);

  return {
    pricePer: Math.round(pricePer * 100) / 100,
    total: Math.round(pricePer * qty * 100) / 100,
  };
}

module.exports = { calculatePrice };
