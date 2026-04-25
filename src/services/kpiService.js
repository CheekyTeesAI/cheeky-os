"use strict";

const { getPrisma } = require("./decisionEngine");

function daysAgo(date) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

async function getKPIs() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const orders = await prisma.order.findMany({
    select: {
      createdAt: true,
      depositPaid: true,
      productionComplete: true,
      totalAmount: true,
      quantity: true,
    },
    take: 5000,
    orderBy: { createdAt: "desc" },
  });

  let todayRevenue = 0;
  let weekRevenue = 0;
  let unpaid = 0;
  let jobsInProduction = 0;
  let stuckOrders = 0;

  for (const o of orders) {
    const amount = Number(o.totalAmount || 0) || (o.quantity ? Number(o.quantity) * 12 : 0);
    const ageDays = daysAgo(o.createdAt);

    if (o.depositPaid && ageDays < 1) {
      todayRevenue += amount;
    }
    if (o.depositPaid && ageDays < 7) {
      weekRevenue += amount;
    }
    if (!o.depositPaid) {
      unpaid += amount;
    }
    if (!o.productionComplete && o.depositPaid) {
      jobsInProduction += 1;
    }
    if (!o.depositPaid && ageDays > 2) {
      stuckOrders += 1;
    }
  }

  return {
    todayRevenue: Math.round(todayRevenue),
    weekRevenue: Math.round(weekRevenue),
    unpaid: Math.round(unpaid),
    jobsInProduction,
    stuckOrders,
  };
}

module.exports = { getKPIs };
