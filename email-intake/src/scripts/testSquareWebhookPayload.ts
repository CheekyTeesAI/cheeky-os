import "dotenv/config";
import { db } from "../db/client";
import { processSquareWebhook } from "../services/squareWebhookService";

const depositPaidPayload = {
  merchant_id: "MERCHANT_EXAMPLE",
  type: "payment.updated",
  event_id: `evt-deposit-${Date.now()}`,
  created_at: new Date().toISOString(),
  data: {
    type: "payment",
    id: "payment_deposit_001",
    object: {
      payment: {
        id: "payment_deposit_001",
        status: "COMPLETED",
        order_id: "SQUARE_ORDER_PLACEHOLDER",
        amount_money: { amount: 15000, currency: "USD" },
        total_money: { amount: 15000, currency: "USD" },
      },
    },
  },
};

const fullPaymentPayload = {
  merchant_id: "MERCHANT_EXAMPLE",
  type: "payment.updated",
  event_id: `evt-full-${Date.now()}`,
  created_at: new Date().toISOString(),
  data: {
    type: "payment",
    id: "payment_full_001",
    object: {
      payment: {
        id: "payment_full_001",
        status: "COMPLETED",
        order_id: "SQUARE_ORDER_PLACEHOLDER",
        amount_money: { amount: 50000, currency: "USD" },
        total_money: { amount: 50000, currency: "USD" },
      },
    },
  },
};

async function seedOrder(squareOrderId: string, squareInvoiceId: string) {
  return db.order.create({
    data: {
      customerName: "Webhook Test",
      email: `wh-${Date.now()}@example.com`,
      notes: "[webhook-test]",
      quotedAmount: 500,
      depositRequired: 150,
      quantity: 12,
      printMethod: "DTG",
      isApproved: true,
      status: "INVOICE_DRAFTED",
      squareOrderId,
      squareInvoiceId,
      squareInvoiceNumber: "INV-TEST-001",
      amountPaid: 0,
    },
  });
}

async function main() {
  const squareOrderId = `sqord_test_${Date.now()}`;

  const order = await seedOrder(squareOrderId, `sqinv_test_${Date.now()}`);

  const depData = depositPaidPayload.data as {
    object: { payment: Record<string, unknown> };
  };
  const depPay = depData.object.payment;

  const p1 = {
    ...depositPaidPayload,
    event_id: `evt-deposit-${order.id}-1`,
    data: {
      ...depositPaidPayload.data,
      object: {
        payment: {
          ...depPay,
          order_id: squareOrderId,
        },
      },
    },
  };

  const fullData = fullPaymentPayload.data as {
    object: { payment: Record<string, unknown> };
  };
  const fullPay = fullData.object.payment;

  const p2 = {
    ...fullPaymentPayload,
    event_id: `evt-full-${order.id}-2`,
    data: {
      ...fullPaymentPayload.data,
      object: {
        payment: {
          ...fullPay,
          order_id: squareOrderId,
        },
      },
    },
  };

  console.log("--- Deposit payment event ---");
  console.log(JSON.stringify(await processSquareWebhook(p1), null, 2));

  const mid = await db.order.findUnique({ where: { id: order.id } });
  console.log("Order after deposit:", mid?.status, mid?.amountPaid);

  console.log("--- Full payment event ---");
  console.log(JSON.stringify(await processSquareWebhook(p2), null, 2));

  const fin = await db.order.findUnique({ where: { id: order.id } });
  console.log("Order after full:", fin?.status, fin?.amountPaid);

  console.log("--- Idempotent replay (deposit event) ---");
  console.log(JSON.stringify(await processSquareWebhook(p1), null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
