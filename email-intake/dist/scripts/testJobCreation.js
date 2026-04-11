"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../db/client");
const jobCreationService_1 = require("../services/jobCreationService");
async function main() {
    let order = await client_1.db.order.findFirst({
        where: {
            depositReceived: true,
            status: { in: ["DEPOSIT_PAID", "PAID_IN_FULL"] },
            job: { is: null },
        },
    });
    if (!order) {
        order = await client_1.db.order.create({
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
    const result = await (0, jobCreationService_1.createJobForDepositedOrder)(order.id);
    console.log(JSON.stringify(result, null, 2));
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(() => client_1.db.$disconnect());
