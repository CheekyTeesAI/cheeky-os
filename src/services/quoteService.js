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

// [CHEEKY-GATE] CHEEKY_acceptQuote — extracted from POST /api/quotes/:id/accept.
// Pure relocation: quote.update ACCEPTED + createDepositFromQuote + order.update.
async function CHEEKY_acceptQuote(quoteId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable" };
  let createDepositFromQuote;
  try {
    createDepositFromQuote = require("./depositService").createDepositFromQuote;
  } catch (_) {
    createDepositFromQuote = null;
  }

  const quote = await prisma.quote.update({
    where: { id: String(quoteId || "") },
    data: { status: "ACCEPTED" },
  });

  let deposit = null;
  if (typeof createDepositFromQuote === "function") {
    try {
      deposit = await createDepositFromQuote(quote.id);
    } catch (squareError) {
      console.log(
        "[DEPOSIT ENGINE SKIPPED]",
        squareError && squareError.message ? squareError.message : squareError
      );
    }
  }

  await prisma.order.update({
    where: { id: quote.orderId },
    data: {
      status: deposit ? "DEPOSIT_PENDING" : "QUOTE_ACCEPTED",
      nextAction: deposit ? "Collect deposit" : "Create deposit invoice",
      nextOwner: "Cheeky",
      blockedReason: deposit ? "WAITING_ON_DEPOSIT" : "INVOICE_NOT_CREATED",
    },
  });

  return {
    success: true,
    data: {
      quote,
      depositCreated: !!deposit,
      paymentLink:
        deposit && deposit.invoice && deposit.invoice.paymentLink
          ? deposit.invoice.paymentLink
          : null,
    },
  };
}

// [CHEEKY-GATE] CHEEKY_listQuotes — extracted from GET /api/quotes.
// Pure relocation: quote.findMany desc order.
async function CHEEKY_listQuotes() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", data: null };
  const list = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return { success: true, data: list };
}

module.exports = { createQuote, CHEEKY_acceptQuote, CHEEKY_listQuotes };
