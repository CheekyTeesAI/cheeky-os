"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresApproval = requiresApproval;
exports.createApprovalRequest = createApprovalRequest;
exports.approveAction = approveAction;
const commandRouter_service_1 = require("../jarvis/services/commandRouter.service");
const approvalQueue = [];
function makeId() {
    return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function requiresApproval(action) {
    if ((action.amount ?? 0) > 500) {
        return { requiresApproval: true, reason: "Action involves money > $500" };
    }
    if ((action.orderValue ?? 0) > 2000) {
        return { requiresApproval: true, reason: "Order value > $2000" };
    }
    if (action.changesProductionStatus) {
        return { requiresApproval: true, reason: "Changing production status requires approval" };
    }
    if (action.externalCommunication) {
        return { requiresApproval: true, reason: "External communication requires approval" };
    }
    return { requiresApproval: false, reason: "Safe action" };
}
function createApprovalRequest(action) {
    const approvalId = makeId();
    const request = {
        approvalId,
        action,
        message: "Approve this action?",
        createdAt: new Date().toISOString()
    };
    approvalQueue.push(request);
    return {
        approvalId: request.approvalId,
        action: request.action,
        message: request.message
    };
}
async function approveAction(approvalId) {
    const idx = approvalQueue.findIndex((r) => r.approvalId === approvalId);
    if (idx < 0) {
        return {
            success: false,
            approvalId,
            message: "Approval request not found"
        };
    }
    const req = approvalQueue[idx];
    approvalQueue.splice(idx, 1);
    const routed = await (0, commandRouter_service_1.routeIntent)(req.action.parsedIntent);
    return {
        success: true,
        approvalId,
        result: routed.result,
        message: "Approved action executed"
    };
}
