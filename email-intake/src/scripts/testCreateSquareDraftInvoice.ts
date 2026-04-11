import "dotenv/config";
import { db } from "../db/client";
import { createSquareDraftInvoiceForOrder } from "../services/squareInvoiceService";

async function main() {
  let order = await db.order.findFirst({
    where: {
      isApproved: true,
      status: { in: ["QUOTE_READY", "APPROVED"] },
      quotedAmount: { gt: 0 },
    },
  });

  if (!order) {
    order = await db.order.create({
      data: {
        customerName: "Square Draft Test",
        email: `sq-draft-${Date.now()}@example.com`,
        notes: "[sq-draft-test] sample",
        quotedAmount: 600,
        estimatedCost: 200,
        depositRequired: 300,
        quantity: 24,
        garmentType: "TEE",
        printMethod: "SCREEN",
        isApproved: true,
        status: "QUOTE_READY",
      },
    });
  }

  const result = await createSquareDraftInvoiceForOrder(order.id);
  console.log(JSON.stringify(result, null, 2));

  const updated = await db.order.findUnique({ where: { id: order.id } });
  console.log("Order after sync:", JSON.stringify(updated, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
