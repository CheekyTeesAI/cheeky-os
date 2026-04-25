"use strict";

const { getPrisma } = require("./decisionEngine");

async function createProductionJob(orderId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const id = String(orderId || "").trim();
  if (!id) throw new Error("ORDER_ID_REQUIRED");

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!order.depositPaid) throw new Error("DEPOSIT_REQUIRED");

  const existing = await prisma.productionJob.findFirst({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const type = String(order.printMethod || "").trim() || "IN_HOUSE";
  const job = await prisma.productionJob.create({
    data: {
      orderId: id,
      type,
      status: "READY",
      assignedTo: "Jeremy",
    },
  });

  return job;
}

module.exports = { createProductionJob };
