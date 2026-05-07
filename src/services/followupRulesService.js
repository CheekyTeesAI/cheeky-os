"use strict";

const { getPrisma } = require("./decisionEngine");

function hoursAgo(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

async function getEligibleOrders() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  /** Explicit select avoids Prisma loading columns missing from DB (schema drift vs migrations). */
  const orders = await prisma.order.findMany({
    where: {
      squareInvoiceId: { not: null },
      depositPaid: false,
      followupDone: false,
    },
    select: {
      id: true,
      customerName: true,
      squareInvoiceId: true,
      depositPaid: true,
      followupDone: true,
      followupCount: true,
      lastFollowupAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const cooldown = parseInt(process.env.FOLLOWUP_COOLDOWN_HOURS || "24", 10);
  const maxPerOrder = parseInt(process.env.FOLLOWUP_MAX_PER_ORDER || "3", 10);

  return orders.filter((o) => {
    if ((o.followupCount || 0) >= maxPerOrder) return false;
    if (hoursAgo(o.lastFollowupAt) < cooldown) return false;
    return true;
  });
}

module.exports = { getEligibleOrders };
