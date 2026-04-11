import "dotenv/config";
import { db } from "../db/client";
import { createJobForDepositedOrder } from "../services/jobCreationService";

async function main() {
  let order = await db.order.findFirst({
    where: {
      depositReceived: true,
      status: { in: ["DEPOSIT_PAID", "PAID_IN_FULL"] },
      job: { is: null },
    },
  });

  if (!order) {
    order = await db.order.create({
      data: {
        customerName: "Job Creation Test",
        email: `job-test-${Date.now()}@example.com`,
        notes: "[job-create-test]",
        quotedAmount: 400,
        depositRequired: 200,
        quantity: 12,
        printMethod: "DTG",
        isApproved: true,
        depositReceived: true,
        depositPaidAt: new Date(),
        amountPaid: 200,
        status: "DEPOSIT_PAID",
      },
    });
  }

  const result = await createJobForDepositedOrder(order.id);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
