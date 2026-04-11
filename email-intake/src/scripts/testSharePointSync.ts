import "dotenv/config";
import { db } from "../db/client";
import { syncOrderToSharePoint } from "../services/sharepointOrderSync";

async function main() {
  const marker = "[sp-sync-test]";

  let order = await db.order.findFirst({
    where: { notes: { contains: marker } },
  });

  if (!order) {
    order = await db.order.create({
      data: {
        customerName: "SP Sync Test",
        email: `sp-sync-${Date.now()}@example.com`,
        notes: `${marker} sample`,
        quotedAmount: 500,
        estimatedCost: 200,
        quantity: 24,
        garmentType: "TEE",
        printMethod: "SCREEN",
        status: "INTAKE",
      },
    });
  }

  const result = await syncOrderToSharePoint(order.id);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
