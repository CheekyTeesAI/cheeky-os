"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateControlRules = evaluateControlRules;
const approval_service_1 = require("./approval.service");
function evaluateControlRules(action) {
    if (action.intent === "UNKNOWN") {
        return { allowed: false, reason: "Unknown intent is blocked" };
    }
    const approval = (0, approval_service_1.requiresApproval)(action);
    if (approval.requiresApproval) {
        return { allowed: false, reason: approval.reason };
    }
    return { allowed: true, reason: "Safe operation allowed" };
}
