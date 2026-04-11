import "dotenv/config";
import { db } from "../db/client";
import { createGarmentOrderForOrder } from "../services/garmentOrderingService";

async function main() {
  const statuses = ["DEPOSIT_PAID", "PRODUCTION_READY", "PAID_IN_FULL"] as const;

  let order = await db.order.findFirst({
    where: {
      depositReceived: true,
      status: { in: [...statuses] },
      garmentOrderStatus: null,
      vendorOrders: {
        none: {
          vendorName: "Carolina Made",
          status: { in: ["DRAFT", "SUBMITTED", "CONFIRMED"] },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!order) {
    order = await db.order.findFirst({
      where: {
        depositReceived: true,
        status: { in: [...statuses] },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!order) {
    console.error(
      "No eligible order. Need depositReceived=true and status in DEPOSIT_PAID | PRODUCTION_READY | PAID_IN_FULL."
    );
    process.exitCode = 1;
    return;
  }

  console.log("Order:", order.id, "status:", order.status, "deposit:", order.depositReceived);
  const result = await createGarmentOrderForOrder(order.id);
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
