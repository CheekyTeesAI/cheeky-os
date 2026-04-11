"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreOrder = scoreOrder;
function revenueScore(order) {
    const estimatedRevenue = Math.max(0, order.qty) * 18;
    if (estimatedRevenue >= 2000)
        return 40;
    if (estimatedRevenue >= 1000)
        return 28;
    if (estimatedRevenue >= 500)
        return 16;
    return 8;
}
function dueDateScore(order) {
    if (!order.dueDate)
        return 4;
    const dueMs = new Date(order.dueDate).getTime();
    if (!Number.isFinite(dueMs))
        return 4;
    const days = (dueMs - Date.now()) / (24 * 60 * 60 * 1000);
    if (days <= 0)
        return 34;
    if (days <= 1)
        return 24;
    if (days <= 2)
        return 14;
    return 6;
}
function statusScore(order) {
    if (order.status === "Production Ready")
        return 24;
    if (order.status === "Printing")
        return 14;
    if (order.status === "Intake")
        return 6;
    if (order.status === "Quote Sent")
        return 8;
    if (order.status === "Deposit Paid")
        return 12;
    return 4;
}
function blockerScore(order) {
    const notes = String(order.notes ?? "").toLowerCase();
    let points = 0;
    const reasons = [];
    if (notes.includes("missing blanks") || notes.includes("out of stock")) {
        points += 20;
        reasons.push("Missing blanks blocker");
    }
    if (notes.includes("awaiting approval") || notes.includes("approval pending")) {
        points += 12;
        reasons.push("Awaiting approval blocker");
    }
    return { points, reasons };
}
function scoreOrder(order) {
    const rev = revenueScore(order);
    const due = dueDateScore(order);
    const status = statusScore(order);
    const blocker = blockerScore(order);
    const reasons = [
        `Revenue weight ${rev}`,
        `Due-date urgency ${due}`,
        `Status weight ${status}`,
        ...blocker.reasons
    ];
    if (order.rush)
        reasons.push("Rush order");
    return {
        score: rev + due + status + blocker.points + (order.rush ? 10 : 0),
        reasons
    };
}
