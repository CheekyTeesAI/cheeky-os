"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemState = getSystemState;
const getActiveLeads_1 = require("../../production/getActiveLeads");
const getActiveOrders_1 = require("../../production/getActiveOrders");
const getActiveTasks_1 = require("../../production/getActiveTasks");
function byProductionPriority(a, b) {
    if (a.rush !== b.rush)
        return a.rush ? -1 : 1;
    const at = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bt = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt)
        return at - bt;
    return b.qty - a.qty;
}
function bySalesPriority(a, b) {
    if (b.value !== a.value)
        return b.value - a.value;
    const at = a.lastActivityDate ? new Date(a.lastActivityDate).getTime() : 0;
    const bt = b.lastActivityDate ? new Date(b.lastActivityDate).getTime() : 0;
    return at - bt;
}
async function getSystemState() {
    const [orders, tasks, leads] = await Promise.all([
        (0, getActiveOrders_1.getActiveOrders)().catch(() => []),
        (0, getActiveTasks_1.getActiveTasks)().catch(() => []),
        (0, getActiveLeads_1.getActiveLeads)().catch(() => [])
    ]);
    return {
        orders,
        tasks,
        leads,
        productionQueue: [...orders].sort(byProductionPriority),
        salesPipeline: [...leads].sort(bySalesPriority)
    };
}
