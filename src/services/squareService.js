"use strict";

const { Client, Environment } = require("square");

function getClient() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: Environment.Production,
  });
}

async function createDraftInvoice(order, estimate) {
  try {
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      throw new Error("SQUARE_NOT_CONFIGURED");
    }
    const client = getClient();
    const { ordersApi, invoicesApi } = client;
    const qty = Math.max(1, Number(order.quantity || 1));
    const lineName =
      (estimate && estimate.lineItems && estimate.lineItems[0] && estimate.lineItems[0].name) ||
      order.product ||
      "Custom Apparel";
    const amountCents = Math.max(100, Math.round(Number(estimate && estimate.amount ? estimate.amount : qty * 12) * 100));

    const orderRes = await ordersApi.createOrder({
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        customerId: order.squareCustomerId || undefined,
        lineItems: [
          {
            name: lineName,
            quantity: String(qty),
            note: order.notes || "",
            basePriceMoney: { amount: BigInt(amountCents), currency: "USD" },
          },
        ],
        state: "OPEN",
      },
      idempotencyKey: `cheeky-v5-order-${order.id}-${Date.now()}`,
    });
    const squareOrderId = orderRes && orderRes.result && orderRes.result.order ? orderRes.result.order.id : null;
    if (!squareOrderId) {
      throw new Error("SQUARE_ORDER_CREATE_FAILED");
    }

    const invoiceRes = await invoicesApi.createInvoice({
      invoice: {
        locationId: process.env.SQUARE_LOCATION_ID,
        orderId: squareOrderId,
        primaryRecipient: order.squareCustomerId ? { customerId: order.squareCustomerId } : undefined,
        acceptedPaymentMethods: {
          card: true,
          bankAccount: false,
          buyNowPayLater: false,
          squareGiftCard: false,
        },
        paymentRequests: [
          {
            requestType: "DEPOSIT",
            dueDate: new Date().toISOString().split("T")[0],
            percentageRequested: "50",
          },
          {
            requestType: "BALANCE",
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          },
        ],
        deliveryMethod: "EMAIL",
        title: `Order #${order.id}`,
        description: order.notes || "",
      },
      idempotencyKey: `cheeky-v5-invoice-${order.id}-${Date.now()}`,
    });
    return invoiceRes.result;
  } catch (e) {
    const details =
      (e && e.body && typeof e.body === "object" && JSON.stringify(e.body)) ||
      (e && e.errors && Array.isArray(e.errors) && JSON.stringify(e.errors)) ||
      (e && e.message) ||
      "SQUARE_DRAFT_CREATE_FAILED";
    throw new Error(details);
  }
}

module.exports = { createDraftInvoice };
