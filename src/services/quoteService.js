"use strict";

const { getPrisma } = require("./decisionEngine");
const { calculatePrice } = require("./pricingService");
const { getMemory } = require("./memoryService");
const { updateOrderFinancials } = require("./financeService");

async function createQuote(orderId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const order = await prisma.order.findUnique({
    where: { id: String(orderId || "") },
    include: { lineItems: true },
  });

  if (!order) throw new Error("ORDER_NOT_FOUND");

  const qty =
    (order.lineItems || []).reduce((sum, i) => sum + (Number(i.quantity || 0) || 0), 0) || 1;
  const key = order.email || order.phone || order.customerName;
  const memory = key ? await getMemory(key) : null;
  const suggestedQty = Number(memory && memory.lastQuantity ? memory.lastQuantity : qty) || qty;

  const pricing = calculatePrice(suggestedQty);

  const quote = await prisma.quote.create({
    data: {
      orderId: order.id,
      total: pricing.total,
      breakdown: `Qty: ${suggestedQty} | Price: ${pricing.pricePer}`,
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      totalAmount: Number(quote.total || 0) || 0,
    },
  });

  await updateOrderFinancials(order.id);

  return quote;
}

module.exports = { createQuote };
