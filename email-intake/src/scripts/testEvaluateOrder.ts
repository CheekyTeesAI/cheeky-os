import { db } from "../db/client";
import { evaluateOrderById } from "../services/orderEvaluator";

async function main() {
  const marker = "[eval-test]";

  let order = await db.order.findFirst({
    where: { notes: { contains: marker } },
  });

  if (!order) {
    order = await db.order.create({
      data: {
        customerName: "Eval Test Customer",
        email: `eval-test-${Date.now()}@example.com`,
        notes: `${marker} sample for order evaluator`,
        quotedAmount: 600,
        estimatedCost: 200,
        quantity: 24,
        printMethod: "SCREEN",
      },
    });
  }

  const updated = await evaluateOrderById(order.id);
  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
