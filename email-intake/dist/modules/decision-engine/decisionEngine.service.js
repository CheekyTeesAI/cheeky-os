"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextBestActions = getNextBestActions;
const systemState_service_1 = require("../core/services/systemState.service");
const actionGenerator_service_1 = require("./actionGenerator.service");
const priorityScoring_service_1 = require("./priorityScoring.service");
function impactRank(v) {
    if (v === "High")
        return 3;
    if (v === "Medium")
        return 2;
    return 1;
}
async function getNextBestActions() {
    const system = await (0, systemState_service_1.getSystemState)();
    const scoredOrders = system.orders.map((order) => {
        const result = (0, priorityScoring_service_1.scoreOrder)(order);
        return { order, score: result.score, reasons: result.reasons };
    });
    scoredOrders.sort((a, b) => b.score - a.score);
    const actions = (0, actionGenerator_service_1.generateActions)({
        scoredOrders: scoredOrders.slice(0, 8),
        tasks: system.tasks.slice(0, 8),
        leads: system.leads.slice(0, 12),
        productionOverloaded: system.productionQueue.length > 8
    });
    return actions
        .sort((a, b) => impactRank(b.impact) - impactRank(a.impact))
        .slice(0, 5);
}
