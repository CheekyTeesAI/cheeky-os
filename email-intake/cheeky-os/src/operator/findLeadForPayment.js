"use strict";

const prisma = require("../prisma");

module.exports = async function findLeadForPayment(input = {}) {
  try {
    if (!prisma) return null;

    const email = input.email || null;
    const phone = input.phone || null;
    const customerName = input.customerName || null;

    if (email) {
      const byEmail = await prisma.lead.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
      });
      if (byEmail) return byEmail;
    }

    if (phone) {
      const byPhone = await prisma.lead.findFirst({
        where: { phone },
        orderBy: { createdAt: "desc" },
      });
      if (byPhone) return byPhone;
    }

    if (customerName) {
      const byName = await prisma.lead.findFirst({
        where: { name: customerName },
        orderBy: { createdAt: "desc" },
      });
      if (byName) return byName;
    }

    return null;
  } catch (_) {
    return null;
  }
};
