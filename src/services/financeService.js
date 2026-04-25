"use strict";

const { getPrisma } = require("./decisionEngine");

// Very simple cost model for quick visibility.
function estimateCost(order) {
  const qty =
    (order.lineItems || []).reduce((sum, i) => sum + (Number(i.quantity || 0) || 0), 0) || 1;
  const costPerShirt = 6;
  const overhead = 1;
  return qty * (costPerShirt + overhead);
}

async function updateOrderFinancials(orderId) {
  const prisma = getPrisma();
  if (!prisma) return;

  const order = await prisma.order.findUnique({
    where: { id: String(orderId || "") },
    include: { lineItems: true },
  });
  if (!order) return;

  const revenue = Number(order.totalAmount || 0) || 0;
  const cost = Number(estimateCost(order) || 0) || 0;
  const profit = revenue - cost;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      revenue,
      costEstimate: cost,
      profit,
    },
  });

  console.log("[FINANCE UPDATED]", order.id);
}

async function getFinancialSummary() {
  const prisma = getPrisma();
  if (!prisma) {
    return { revenue: 0, cost: 0, profit: 0, unpaid: 0 };
  }

  const orders = await prisma.order.findMany({
    select: {
      depositPaid: true,
      revenue: true,
      costEstimate: true,
      profit: true,
      totalAmount: true,
    },
  });

  let revenue = 0;
  let cost = 0;
  let profit = 0;
  let unpaid = 0;

  for (const o of orders) {
    const orderRevenue = Number(o.revenue ?? o.totalAmount ?? 0) || 0;
    revenue += orderRevenue;
    cost += Number(o.costEstimate || 0) || 0;
    profit += Number(o.profit || 0) || 0;
    if (!o.depositPaid) unpaid += orderRevenue;
  }

  return {
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    profit: Math.round(profit),
    unpaid: Math.round(unpaid),
  };
}

module.exports = {
  updateOrderFinancials,
  getFinancialSummary,
};
