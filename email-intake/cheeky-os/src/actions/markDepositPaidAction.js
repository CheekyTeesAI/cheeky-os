"use strict";

const prisma = require("../prisma");

module.exports = async function markDepositPaidAction(leadId) {
  try {
    if (!leadId) {
      return { success: false, message: "Missing leadId" };
    }
    if (!prisma) {
      return { success: false, message: "Prisma unavailable" };
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return { success: false, message: "Lead not found" };
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        depositPaid: true,
        paymentStatus: "DEPOSIT_PAID",
      },
    });

    return {
      success: true,
      message: "Deposit marked paid",
      lead: updated,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
