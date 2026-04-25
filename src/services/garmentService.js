"use strict";

const { getPrisma } = require("./decisionEngine");

async function createGarmentOrder(productionJobId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const job = await prisma.productionJob.findUnique({
    where: { id: String(productionJobId || "") },
    include: { order: true },
  });

  if (!job) throw new Error("JOB_NOT_FOUND");
  if (!job.order || !job.order.depositPaid) throw new Error("DEPOSIT_REQUIRED");

  const existing = await prisma.garmentOrder.findFirst({
    where: { productionJobId: job.id },
  });
  if (existing) return existing;

  const order = await prisma.garmentOrder.create({
    data: {
      productionJobId: job.id,
      orderId: job.orderId,
      vendorName: job.vendorName || "Carolina Made",
      vendor: job.vendorName || "Carolina Made",
      status: "ORDERED",
      notes: "Manual order placed",
      packet: null,
    },
  });

  await prisma.order.update({
    where: { id: job.orderId },
    data: { garmentsOrdered: true },
  });

  return order;
}

async function markGarmentsReceived(id) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const updated = await prisma.garmentOrder.update({
    where: { id: String(id || "") },
    data: { status: "RECEIVED" },
  });

  if (updated.orderId) {
    await prisma.order.update({
      where: { id: updated.orderId },
      data: { garmentsReceived: true },
    });
  }

  if (updated.productionJobId) {
    await prisma.productionJob.update({
      where: { id: updated.productionJobId },
      data: { garmentsReady: true },
    });
  }

  return updated;
}

module.exports = {
  createGarmentOrder,
  markGarmentsReceived,
};
