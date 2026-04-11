"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../db/client");
const squareInvoiceService_1 = require("../services/squareInvoiceService");
async function main() {
    let order = await client_1.db.order.findFirst({
        where: {
            isApproved: true,
            status: { in: ["QUOTE_READY", "APPROVED"] },
            quotedAmount: { gt: 0 },
        },
    });
    if (!order) {
        order = await client_1.db.order.create({
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
    const result = await (0, squareInvoiceService_1.createSquareDraftInvoiceForOrder)(order.id);
    console.log(JSON.stringify(result, null, 2));
    const updated = await client_1.db.order.findUnique({ where: { id: order.id } });
    console.log("Order after sync:", JSON.stringify(updated, null, 2));
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(() => client_1.db.$disconnect());
