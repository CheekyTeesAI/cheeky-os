"use strict";

const { getPrisma } = require("./decisionEngine");

function getCustomerKey(order) {
  return (
    (order && (order.email || order.phone || order.customerName)) ||
    "UNKNOWN"
  );
}

async function updateMemory(orderId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const order = await prisma.order.findUnique({
    where: { id: String(orderId || "") },
    include: { lineItems: true },
  });
  if (!order) return;

  const item = order.lineItems && order.lineItems[0] ? order.lineItems[0] : null;
  const key = getCustomerKey(order);

  await prisma.customerMemory.upsert({
    where: { customerKey: key },
    update: {
      customerName: order.customerName || null,
      lastProduct: (item && item.description) || order.notes || null,
      lastQuantity: (item && item.quantity) || order.quantity || null,
      lastOrderId: order.id,
    },
    create: {
      customerKey: key,
      customerName: order.customerName || null,
      lastProduct: (item && item.description) || order.notes || null,
      lastQuantity: (item && item.quantity) || order.quantity || null,
      lastOrderId: order.id,
    },
  });

  console.log("[MEMORY UPDATED]", key);
}

async function getMemory(customerKey) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.customerMemory.findUnique({
    where: { customerKey: String(customerKey || "") },
  });
}

module.exports = {
  updateMemory,
  getMemory,
};
