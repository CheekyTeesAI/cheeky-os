import "dotenv/config";
import { db } from "../db/client";
import { createDigitizingRequestForOrder } from "../services/digitizingService";

async function main() {
  const order =
    (await db.order.findFirst({
      where: {
        OR: [
          { printMethod: { contains: "EMB", mode: "insensitive" } },
          { notes: { contains: "embroider", mode: "insensitive" } },
          { digitizingRequired: true },
        ],
      },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await db.order.findFirst({
      where: { depositReceived: true },
      orderBy: { updatedAt: "desc" },
    }));

  if (!order) {
    console.error("No orders in database.");
    process.exitCode = 1;
    return;
  }

  if (!order.printMethod?.toUpperCase().includes("EMB")) {
    await db.order.update({
      where: { id: order.id },
      data: { printMethod: "EMB" },
    });
    console.log("Temporarily set printMethod=EMB on order for test:", order.id);
  }

  const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  console.log("Using order:", fresh.id, "printMethod:", fresh.printMethod);
  const result = await createDigitizingRequestForOrder(fresh.id);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
