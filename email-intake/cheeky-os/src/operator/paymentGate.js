"use strict";

module.exports = function paymentGate(input = {}) {
  try {
    const depositRequired = input.depositRequired !== false;
    const depositPaid = input.depositPaid === true;

    if (!depositRequired) {
      return {
        allowed: true,
        blocked: false,
        reason: null,
      };
    }

    if (!depositPaid) {
      return {
        allowed: false,
        blocked: true,
        reason: "Deposit not paid",
      };
    }

    return {
      allowed: true,
      blocked: false,
      reason: null,
    };
  } catch (_) {
    return {
      allowed: false,
      blocked: true,
      reason: "Payment gate error",
    };
  }
};
