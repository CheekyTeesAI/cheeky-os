"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../db/client");
const productionRoutingService_1 = require("../services/productionRoutingService");
const scenarios = [
    { name: "DTG standard", printMethod: "DTG", quantity: 12 },
    { name: "SCREEN 24+", printMethod: "SCREEN", quantity: 24 },
    { name: "SCREEN under 24 → DTF", printMethod: "SCREEN", quantity: 12 },
    { name: "EMB below min", printMethod: "EMB", quantity: 6 },
    { name: "DTG + rush note", printMethod: "DTG", quantity: 24, notes: "rush event" },
    { name: "DTG + outsource", printMethod: "DTG", quantity: 12, notes: "Please outsource this run" },
    { name: "Missing print method", printMethod: "", quantity: 12 },
];
async function runScenario(sc) {
    const email = `route-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const order = await client_1.db.order.create({
        data: {
            customerName: `Routing Test: ${sc.name}`,
            email,
            depositReceived: true,
            status: "PRODUCTION_READY",
            printMethod: sc.printMethod || null,
            quantity: sc.quantity,
            notes: sc.notes ?? "",
            isRush: sc.isRush ?? false,
        },
    });
    const result = await (0, productionRoutingService_1.routeProductionForOrder)(order.id);
    console.log("\n===", sc.name, "===");
    console.log(JSON.stringify(result, null, 2));
    await client_1.db.productionRoute.deleteMany({ where: { orderId: order.id } });
    await client_1.db.order.delete({ where: { id: order.id } });
}
async function main() {
    const deposited = await client_1.db.order.findFirst({
        where: {
            depositReceived: true,
            status: { in: ["DEPOSIT_PAID", "PRODUCTION_READY", "PAID_IN_FULL"] },
        },
        orderBy: { updatedAt: "desc" },
    });
    if (deposited) {
        console.log("Live order smoke test:", deposited.id);
        try {
            const result = await (0, productionRoutingService_1.routeProductionForOrder)(deposited.id);
            console.log(JSON.stringify(result, null, 2));
        }
        catch (e) {
            console.warn("Live order routing skipped/failed:", e);
        }
    }
    for (const sc of scenarios) {
        await runScenario(sc);
    }
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(() => {
    void client_1.db.$disconnect();
});
