"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayWork = getTodayWork;
exports.getUrgentOrders = getUrgentOrders;
exports.getPendingApprovals = getPendingApprovals;
const todayService_1 = require("./todayService");
const safetyGuardService_1 = require("./safetyGuardService");
function emptyActions() {
    return {
        printQueue: [],
        needsReview: [],
        urgentOrders: [],
        blockedOrders: [],
    };
}
/**
 * Prep-only voice hook: no AI, no external APIs, no background work.
 */
async function getTodayWork() {
    const gate = (0, safetyGuardService_1.evaluateOperationSafety)({ operation: "voice_get_today_work" });
    if (!gate.allowed) {
        return { success: false, ...emptyActions() };
    }
    try {
        const actions = await (0, todayService_1.getTodayActions)();
        return { success: true, ...actions };
    }
    catch {
        return { success: false, ...emptyActions() };
    }
}
async function getUrgentOrders() {
    const gate = (0, safetyGuardService_1.evaluateOperationSafety)({ operation: "voice_get_urgent_orders" });
    if (!gate.allowed) {
        return { success: true, orders: [] };
    }
    try {
        const { urgentOrders } = await (0, todayService_1.getTodayActions)();
        return { success: true, orders: urgentOrders };
    }
    catch {
        return { success: true, orders: [] };
    }
}
async function getPendingApprovals() {
    const gate = (0, safetyGuardService_1.evaluateOperationSafety)({
        operation: "voice_get_pending_approvals",
    });
    if (!gate.allowed) {
        return {
            success: true,
            pending: [],
            note: "Operation blocked by safety guard.",
        };
    }
    try {
        const { needsReview } = await (0, todayService_1.getTodayActions)();
        return {
            success: true,
            pending: needsReview,
            note: "Derived from open exception reviews and manual-override orders (prep layer).",
        };
    }
    catch {
        return {
            success: true,
            pending: [],
            note: "Placeholder: approvals feed unavailable.",
        };
    }
}
