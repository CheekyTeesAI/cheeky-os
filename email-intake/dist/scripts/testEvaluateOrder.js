"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../db/client");
const orderEvaluator_1 = require("../services/orderEvaluator");
async function main() {
    const marker = "[eval-test]";
    let order = await client_1.db.order.findFirst({
        where: { notes: { contains: marker } },
    });
    if (!order) {
        order = await client_1.db.order.create({
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
    const updated = await (0, orderEvaluator_1.evaluateOrderById)(order.id);
    console.log(JSON.stringify(updated, null, 2));
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(() => client_1.db.$disconnect());
