"use strict";

const { getPrisma } = require("./decisionEngine");
const { createDraftDepositInvoice } = require("./squareInvoiceService");

async function createDepositFromQuote(quoteId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const quote = await prisma.quote.findUnique({
    where: { id: String(quoteId || "") },
    include: { order: true },
  });

  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  const order = quote.order;
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const invoice = await createDraftDepositInvoice(order, quote);

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      squareInvoiceId: invoice.squareInvoiceId,
      paymentLink: invoice.paymentLink,
      depositAmount: invoice.depositAmount,
      status: "DEPOSIT_PENDING",
      nextAction: "Collect deposit",
      nextOwner: "Cheeky",
      blockedReason: "WAITING_ON_DEPOSIT",
    },
  });

  return {
    order: updatedOrder,
    invoice,
  };
}

module.exports = { createDepositFromQuote };
