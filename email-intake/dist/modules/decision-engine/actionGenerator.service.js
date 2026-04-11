"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateActions = generateActions;
function leadStale(lead) {
    if (!lead.lastActivityDate)
        return true;
    const t = new Date(lead.lastActivityDate).getTime();
    if (!Number.isFinite(t))
        return true;
    return Date.now() - t > 48 * 60 * 60 * 1000;
}
function orderAction(scored) {
    const order = scored.order;
    const notes = String(order.notes ?? "").toLowerCase();
    if (notes.includes("missing blanks") || notes.includes("out of stock")) {
        return {
            action: `Order blanks for ${order.customerName || order.name}`,
            reason: "Production blocked by missing blanks",
            impact: "High"
        };
    }
    if (notes.includes("awaiting approval") || notes.includes("approval pending")) {
        return {
            action: `Move ${order.customerName || order.name} to production`,
            reason: "Approval blocker can be cleared immediately",
            impact: "Medium"
        };
    }
    return {
        action: `Print ${order.customerName || order.name} job`,
        reason: scored.reasons.slice(0, 2).join(", "),
        impact: scored.score >= 70 ? "High" : scored.score >= 40 ? "Medium" : "Low"
    };
}
function generateActions(input) {
    const actions = [];
    for (const scored of input.scoredOrders) {
        actions.push(orderAction(scored));
    }
    for (const task of input.tasks) {
        actions.push({
            action: `Complete ${task.taskName}`,
            reason: task.dueDate ? `Due ${task.dueDate}` : "Open task",
            impact: "Medium"
        });
    }
    for (const lead of input.leads) {
        if (!leadStale(lead))
            continue;
        actions.push({
            action: `Follow up ${lead.customerName}`,
            reason: "No activity in 48+ hours",
            impact: lead.value >= 1000 ? "High" : "Medium"
        });
    }
    if (input.productionOverloaded) {
        actions.push({
            action: "Defer low priority jobs",
            reason: "Production queue overloaded",
            impact: "High"
        });
    }
    const deduped = Array.from(new Map(actions.map((a) => [a.action, a])).values());
    return deduped;
}
