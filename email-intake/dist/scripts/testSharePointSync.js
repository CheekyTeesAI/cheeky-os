"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../db/client");
const sharepointOrderSync_1 = require("../services/sharepointOrderSync");
async function main() {
    const marker = "[sp-sync-test]";
    let order = await client_1.db.order.findFirst({
        where: { notes: { contains: marker } },
    });
    if (!order) {
        order = await client_1.db.order.create({
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
    const result = await (0, sharepointOrderSync_1.syncOrderToSharePoint)(order.id);
    console.log(JSON.stringify(result, null, 2));
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(() => client_1.db.$disconnect());
