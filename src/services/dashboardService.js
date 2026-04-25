"use strict";

const { getPrisma } = require("./decisionEngine");
const { scoreOrder } = require("./priorityService");

async function getDashboardData() {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("Database unavailable");
  }

  const orders = await prisma.order.findMany({
    include: { lineItems: true },
    take: 1000,
    orderBy: [{ updatedAt: "desc" }],
  });

  const depositsNeeded = orders.filter((o) => !o.depositPaid);
  const readyToPrint = orders.filter((o) => o.garmentsReceived && !o.productionComplete);
  const inQC = orders.filter((o) => o.productionComplete && !o.qcComplete);
  const readyPickup = orders.filter((o) => o.qcComplete);

  const prioritized = readyToPrint
    .map((o) => ({ ...o, score: scoreOrder(o) }))
    .sort((a, b) => b.score - a.score);

  return {
    totals: {
      totalOrders: orders.length,
      depositsNeeded: depositsNeeded.length,
      readyToPrint: readyToPrint.length,
      qc: inQC.length,
      pickup: readyPickup.length,
    },
    topPrint: prioritized.slice(0, 5),
    depositsNeeded,
    readyPickup,
  };
}

module.exports = { getDashboardData };
