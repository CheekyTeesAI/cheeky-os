"use strict";

const { getPrisma } = require("./decisionEngine");

function asAmount(order) {
  const direct = Number(order && order.totalAmount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const qty = Number(order && order.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty * 12;
  return 0;
}

async function getCashflow() {
  const prisma = getPrisma();
  if (!prisma) {
    return { unpaid: 0, pipeline: 0, collected: 0, total: 0 };
  }

  const orders = await prisma.order.findMany({
    select: {
      totalAmount: true,
      quantity: true,
      depositPaid: true,
      productionComplete: true,
    },
    take: 5000,
  });

  let unpaid = 0;
  let pipeline = 0;
  let collected = 0;

  for (const o of orders || []) {
    const amount = asAmount(o);
    if (!o || amount <= 0) continue;

    if (!o.depositPaid) unpaid += amount;
    if (o.depositPaid && !o.productionComplete) pipeline += amount;
    if (o.productionComplete) collected += amount;
  }

  return {
    unpaid: Math.round(unpaid),
    pipeline: Math.round(pipeline),
    collected: Math.round(collected),
    total: Math.round(unpaid + pipeline + collected),
  };
}

module.exports = { getCashflow };
