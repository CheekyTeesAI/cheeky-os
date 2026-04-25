"use strict";

module.exports = function paymentStatusResolver(input = {}) {
  try {
    const paidAmount = Number(input.paidAmount || 0);
    const depositAmount = Number(input.depositAmount || 0);
    const totalAmount = Number(input.totalAmount || 0);

    if (paidAmount <= 0) {
      return {
        paymentStatus: "UNPAID",
        depositPaid: false,
        fullyPaid: false,
      };
    }

    if (depositAmount > 0 && paidAmount >= depositAmount && (totalAmount <= 0 || paidAmount < totalAmount)) {
      return {
        paymentStatus: "DEPOSIT_PAID",
        depositPaid: true,
        fullyPaid: false,
      };
    }

    if (totalAmount > 0 && paidAmount >= totalAmount) {
      return {
        paymentStatus: "PAID_IN_FULL",
        depositPaid: true,
        fullyPaid: true,
      };
    }

    return {
      paymentStatus: "PARTIALLY_PAID",
      depositPaid: false,
      fullyPaid: false,
    };
  } catch (_) {
    return {
      paymentStatus: "UNPAID",
      depositPaid: false,
      fullyPaid: false,
    };
  }
};
