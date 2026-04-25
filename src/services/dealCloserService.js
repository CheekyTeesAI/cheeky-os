"use strict";

const { getPrisma } = require("./decisionEngine");

function scoreOrder(order) {
  let score = 0;

  const amount =
    Number(order && order.totalAmount) ||
    (Number(order && order.quantity) ? Number(order.quantity) * 12 : 0);

  score += Math.min(amount, 5000);
  if (order && order.squareInvoiceId) score += 200;
  if (order && !order.depositPaid) score += 300;

  if (order && order.createdAt) {
    const ageDays = Math.floor(
      (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (Number.isFinite(ageDays) && ageDays > 0) score += Math.min(ageDays * 20, 300);
  }

  if (order && order.closeStatus === "SNOOZED") score -= 500;
  return score;
}

async function getDealList() {
  const prisma = getPrisma();
  if (!prisma) return [];

  const orders = await prisma.order.findMany({
    where: { depositPaid: false },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return (orders || [])
    .map((o) => ({ ...o, score: scoreOrder(o) }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

module.exports = { getDealList, scoreOrder };
