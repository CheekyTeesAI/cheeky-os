"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBusinessState = getBusinessState;
const salesState_service_1 = require("./salesState.service");
const productionState_service_1 = require("./productionState.service");
const prioritization_service_1 = require("./prioritization.service");
const actionQueue_service_1 = require("./actionQueue.service");
function computeHealth(sales, prod) {
    const reasons = [];
    const estimateLow = sales.revenue.estimateCount < 3;
    const revenueLow = sales.revenue.recentInvoiceTotal < 1000;
    const rushOverload = prod.summary.rushJobCount > 3;
    const fewDeals = sales.pipeline.openDeals < 4;
    const missingDueHeavy = prod.jobs.filter((j) => !j.dueDate).length >= 3;
    const moderateLoad = prod.summary.activeJobCount >= 6 && prod.summary.activeJobCount <= 8;
    if ((estimateLow && revenueLow) || rushOverload) {
        if (estimateLow && revenueLow) {
            reasons.push("Estimate pipeline thin and recent invoice total soft");
        }
        if (rushOverload) {
            reasons.push("Rush production load beyond comfort zone");
        }
        return { status: "CRITICAL", reasons };
    }
    if (moderateLoad || fewDeals || missingDueHeavy || prod.bottlenecks.length >= 2) {
        if (moderateLoad)
            reasons.push("Production load elevated");
        if (fewDeals)
            reasons.push("Pipeline adequate but not strong");
        if (missingDueHeavy)
            reasons.push("Several jobs lack due dates");
        if (prod.bottlenecks.length >= 2)
            reasons.push("Multiple production bottlenecks flagged");
        return { status: "WARNING", reasons: reasons.length ? reasons : ["Review bottlenecks"] };
    }
    return { status: "STABLE", reasons: ["Flows within normal bands"] };
}
async function getBusinessState() {
    const [sales, production] = await Promise.all([(0, salesState_service_1.getSalesState)(), (0, productionState_service_1.getProductionState)()]);
    const priorities = {
        sales: (0, prioritization_service_1.getTopSalesPriorities)(sales),
        production: (0, prioritization_service_1.getTopProductionPriorities)(production)
    };
    const actions = (0, actionQueue_service_1.buildActionQueue)({ salesState: sales, productionState: production });
    const health = computeHealth(sales, production);
    return {
        timestamp: new Date().toISOString(),
        sales,
        production,
        priorities,
        actions,
        health
    };
}
