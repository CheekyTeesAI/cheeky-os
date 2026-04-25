"use strict";

module.exports = function depositEngine(pricing = {}) {
  try {
    const total = Number((pricing || {}).total || 0);
    const depositAmount = Math.round(total * 0.5);

    return {
      depositRequired: true,
      depositAmount,
      paymentStatus: depositAmount > 0 ? "DEPOSIT_REQUIRED" : "UNPAID",
      reasoning: "50% deposit required before ordering blanks or starting production",
    };
  } catch (_) {
    return {
      depositRequired: true,
      depositAmount: 0,
      paymentStatus: "UNPAID",
      reasoning: "Deposit engine fallback",
    };
  }
};
