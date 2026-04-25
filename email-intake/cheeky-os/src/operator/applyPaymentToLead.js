"use strict";

const prisma = require("../prisma");
const paymentStatusResolver = require("./paymentStatusResolver");

module.exports = async function applyPaymentToLead(lead, input = {}) {
  try {
    if (!lead) {
      return {
        success: false,
        message: "Lead not found",
      };
    }
    if (!prisma) {
      return {
        success: false,
        message: "Prisma unavailable",
      };
    }

    const paidAmount = Number(input.paidAmount || 0);
    const totalAmount = Number(lead.quoteAmount || 0);
    const depositAmount = Number(lead.depositAmount || 0);

    const resolved = paymentStatusResolver({
      paidAmount,
      depositAmount,
      totalAmount,
    });

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        depositPaid: resolved.depositPaid,
        paymentStatus: resolved.paymentStatus,
      },
    });

    return {
      success: true,
      lead: updated,
      payment: resolved,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
