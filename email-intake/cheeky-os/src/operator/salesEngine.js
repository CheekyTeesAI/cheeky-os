"use strict";

const path = require("path");
const generateMessage = require("./messageGenerator");
const scoreLead = require("./leadEngine");

function getPrismaClient() {
  try {
    const prisma = require("../prisma");
    if (prisma) return prisma;
  } catch (_) {}

  const candidates = [
    path.join(__dirname, "..", "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "..", "services", "decisionEngine"),
  ];

  for (const candidate of candidates) {
    try {
      const decisionEngine = require(candidate);
      if (decisionEngine && typeof decisionEngine.getPrisma === "function") {
        const prisma = decisionEngine.getPrisma();
        if (prisma) return prisma;
      }
    } catch (_) {}
  }

  return null;
}

module.exports = async function salesEngine() {
  try {
    const results = {
      success: true,
      unpaidInvoices: [],
      staleCustomers: [],
      actions: [],
    };

    const prisma = getPrismaClient();
    if (!prisma) {
      return {
        ...results,
        success: false,
        error: "Prisma unavailable",
      };
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // UNPAID INVOICES (FOLLOW-UP)
    try {
      const unpaid = await prisma.order.findMany({
        where: {
          status: "QUOTE_SENT",
          createdAt: { lt: sevenDaysAgo },
        },
        take: 10,
      });

      results.unpaidInvoices = unpaid;

      unpaid.forEach((order) => {
        const lead = scoreLead(
          { name: order.customerName, orderCount: order.orderCount || 0 },
          { quantity: order.quantity || 0 }
        );

        results.actions.push({
          type: "FOLLOW_UP_INVOICE",
          message: `Follow up with ${order.customerName || "customer"}`,
          priority: lead.tier,
          score: lead.score,
          orderId: order.id,
          customerName: order.customerName,
          email: order.email || null,
          suggestedMessage: generateMessage({
            type: "FOLLOW_UP_INVOICE",
            customerName: order.customerName,
          }),
        });
      });
    } catch (_) {}

    // STALE CUSTOMERS
    try {
      const customers = await prisma.customer.findMany({
        where: {
          lastOrderAt: { lt: thirtyDaysAgo },
        },
        take: 10,
      });

      results.staleCustomers = customers;

      customers.forEach((c) => {
        const lead = scoreLead(
          { name: c.name, orderCount: c.orderCount || 0 },
          { quantity: 0 }
        );

        results.actions.push({
          type: "REACTIVATE_CUSTOMER",
          message: `Reach out to ${c.name}`,
          priority: lead.tier,
          score: lead.score,
          customerId: c.id,
          customerName: c.name,
          email: c.email || null,
          suggestedMessage: generateMessage({
            type: "REACTIVATE_CUSTOMER",
            customerName: c.name,
          }),
        });
      });
    } catch (_) {}

    results.actions = results.actions
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
      .slice(0, 5);

    return results;
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
      unpaidInvoices: [],
      staleCustomers: [],
      actions: [],
    };
  }
};
