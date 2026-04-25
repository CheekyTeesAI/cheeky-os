"use strict";

module.exports = function releaseGateEngine(input = {}) {
  try {
    const depositRequired = input.depositRequired !== false;
    const depositPaid = input.depositPaid === true;
    const paymentStatus = input.paymentStatus || "UNPAID";

    if (!depositRequired) {
      return {
        allowed: true,
        blocked: false,
        releaseStatus: "READY",
        reason: null,
      };
    }

    if (!depositPaid) {
      return {
        allowed: false,
        blocked: true,
        releaseStatus: "BLOCKED",
        reason: "Deposit not paid",
      };
    }

    if (paymentStatus !== "DEPOSIT_PAID" && paymentStatus !== "PAID_IN_FULL") {
      return {
        allowed: false,
        blocked: true,
        releaseStatus: "BLOCKED",
        reason: "Payment status not verified",
      };
    }

    return {
      allowed: true,
      blocked: false,
      releaseStatus: "READY",
      reason: null,
    };
  } catch (_) {
    return {
      allowed: false,
      blocked: true,
      releaseStatus: "BLOCKED",
      reason: "Release gate error",
    };
  }
};
