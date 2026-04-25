"use strict";

const { getPrisma } = require("./decisionEngine");

function daysAgo(date) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

async function getInsights() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const orders = await prisma.order.findMany({
    select: {
      createdAt: true,
      depositPaid: true,
      productionComplete: true,
    },
    take: 5000,
    orderBy: { createdAt: "desc" },
  });

  const insights = [];
  let unpaidCount = 0;
  let stuckCount = 0;
  let productionLoad = 0;

  for (const o of orders) {
    const age = daysAgo(o.createdAt);
    if (!o.depositPaid) unpaidCount++;
    if (!o.depositPaid && age > 2) stuckCount++;
    if (o.depositPaid && !o.productionComplete) productionLoad++;
  }

  if (stuckCount > 0) {
    insights.push({
      type: "CRITICAL",
      message: `${stuckCount} orders stuck without deposit`,
      action: "Follow up immediately",
    });
  }

  if (productionLoad > 10) {
    insights.push({
      type: "WARNING",
      message: `High production load: ${productionLoad} jobs`,
      action: "Schedule + prioritize",
    });
  }

  if (unpaidCount > 0) {
    insights.push({
      type: "OPPORTUNITY",
      message: `${unpaidCount} unpaid orders`,
      action: "Push deposits",
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "GOOD",
      message: "System running clean",
      action: "Focus on sales",
    });
  }

  return insights;
}

module.exports = { getInsights };
