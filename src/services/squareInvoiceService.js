"use strict";

const { Client, Environment } = require("square");

function getSquareClient() {
  if (!process.env.SQUARE_ACCESS_TOKEN) {
    throw new Error("SQUARE_ACCESS_TOKEN_MISSING");
  }

  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment:
      process.env.SQUARE_ENVIRONMENT === "production"
        ? Environment.Production
        : Environment.Sandbox,
  });
}

async function createDraftDepositInvoice(order, quote) {
  const client = getSquareClient();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error("SQUARE_LOCATION_ID_MISSING");
  }

  const total = Number((quote && quote.total) || 0) || 0;
  const depositAmount = Math.round(total * 0.5 * 100);
  const title = `Deposit for Order ${order.id}`;
  const description = (order && order.notes) || "Deposit invoice";

  const result = await client.invoicesApi.createInvoice({
    invoice: {
      locationId,
      title,
      description,
      primaryRecipient: {
        customerId: order && order.squareCustomerId ? order.squareCustomerId : undefined,
      },
      paymentRequests: [
        {
          requestType: "DEPOSIT",
          dueDate: new Date().toISOString().split("T")[0],
          fixedAmountRequestedMoney:
            depositAmount > 0
              ? {
                  amount: depositAmount,
                  currency: "USD",
                }
              : undefined,
          percentageRequested: depositAmount > 0 ? undefined : "50",
        },
      ],
    },
    idempotencyKey: `dep-${order.id}-${quote.id}-${Date.now()}`,
    version: 0,
  });

  const invoice = result && result.result ? result.result.invoice : null;
  if (!invoice || !invoice.id) throw new Error("SQUARE_INVOICE_CREATE_FAILED");

  return {
    squareInvoiceId: invoice.id,
    depositAmount: depositAmount / 100,
    paymentLink: invoice.publicUrl || `https://squareup.com/pay-invoice/${invoice.id}`,
    raw: invoice,
  };
}

module.exports = { createDraftDepositInvoice };
