"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyActionType = classifyActionType;
exports.canAutoExecute = canAutoExecute;
function extractTarget(action) {
    if (action.startsWith("Follow up "))
        return action.replace("Follow up ", "").trim();
    if (action.startsWith("Print "))
        return action.replace("Print ", "").replace(" job", "").trim();
    if (action.startsWith("Order blanks for "))
        return action.replace("Order blanks for ", "").trim();
    if (action.startsWith("Move "))
        return action.replace("Move ", "").replace(" to production", "").trim();
    if (action.startsWith("Complete "))
        return action.replace("Complete ", "").trim();
    return "";
}
function estimateValueForAction(action, state) {
    const target = extractTarget(action.action).toLowerCase();
    if (!target)
        return 0;
    const order = state.orders.find((o) => o.name.toLowerCase().includes(target) ||
        String(o.customerName || "").toLowerCase().includes(target));
    if (order)
        return Math.max(0, order.qty) * 18;
    const lead = state.leads.find((l) => l.customerName.toLowerCase().includes(target));
    if (lead)
        return Math.max(0, lead.value);
    return 0;
}
function classifyActionType(actionText) {
    if (actionText.startsWith("Follow up "))
        return "FOLLOW_UP";
    if (actionText.startsWith("Move ") && actionText.includes(" to production"))
        return "MOVE_TO_PRODUCTION";
    if (actionText.startsWith("Complete "))
        return "CREATE_TASK";
    if (actionText.startsWith("Defer ") || actionText.startsWith("Order blanks "))
        return "FLAG_ISSUE";
    return "UNKNOWN";
}
function canAutoExecute(action, state) {
    const actionType = classifyActionType(action.action);
    if (actionType === "UNKNOWN") {
        return { allowed: false, reason: "Action unclear" };
    }
    const estValue = estimateValueForAction(action, state);
    if (estValue > 2000) {
        return { allowed: false, reason: "Order value above $2000 requires approval" };
    }
    if (!action.action || !action.reason) {
        return { allowed: false, reason: "Missing required action data" };
    }
    if (actionType === "FOLLOW_UP" || actionType === "CREATE_TASK" || actionType === "FLAG_ISSUE") {
        return { allowed: true };
    }
    if (actionType === "MOVE_TO_PRODUCTION") {
        return { allowed: true };
    }
    return { allowed: false, reason: "Action not auto-approved" };
}
