"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutoOperator = runAutoOperator;
const decisionEngine_service_1 = require("../decision-engine/decisionEngine.service");
const systemState_service_1 = require("../core/services/systemState.service");
const actionExecutor_service_1 = require("./actionExecutor.service");
const safetyGuard_service_1 = require("./safetyGuard.service");
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
    return null;
}
function toExecutionInput(action, state) {
    const type = (0, safetyGuard_service_1.classifyActionType)(action.action);
    const target = extractTarget(action.action);
    const order = target
        ? state.orders.find((o) => o.name.toLowerCase().includes(target.toLowerCase()) ||
            String(o.customerName || "").toLowerCase().includes(target.toLowerCase()))
        : undefined;
    if (type === "FOLLOW_UP") {
        return { type, action: action.action, target };
    }
    if (type === "MOVE_TO_PRODUCTION") {
        return { type, action: action.action, target, orderId: order?.id || null };
    }
    if (type === "CREATE_TASK") {
        return { type, action: action.action, target };
    }
    if (type === "FLAG_ISSUE") {
        return {
            type,
            action: action.action,
            target,
            orderId: order?.id || null,
            note: `Auto issue flag: ${action.reason}`
        };
    }
    return { type: "FLAG_ISSUE", action: action.action, target, note: "Unknown action mapped as issue" };
}
async function runAutoOperator(mode = "execute") {
    const [actions, state] = await Promise.all([(0, decisionEngine_service_1.getNextBestActions)(), (0, systemState_service_1.getSystemState)()]);
    const executed = [];
    const skipped = [];
    const warnings = [];
    for (const action of actions.slice(0, 3)) {
        const safety = (0, safetyGuard_service_1.canAutoExecute)(action, state);
        if (!safety.allowed) {
            skipped.push({ action: action.action, reason: safety.reason || "Blocked by safety guard" });
            continue;
        }
        if (mode === "dry-run") {
            executed.push({
                action: action.action,
                result: "would_execute",
                reason: action.reason,
                impact: action.impact
            });
            continue;
        }
        const execInput = toExecutionInput(action, state);
        const result = await (0, actionExecutor_service_1.executeAction)(execInput);
        if (!result.success) {
            warnings.push(`Execution failed: ${action.action}`);
        }
        executed.push({
            action: action.action,
            result: result.result,
            details: result.details || null
        });
    }
    if (actions.length === 0) {
        warnings.push("No actions available from decision engine");
    }
    return { executed, skipped, warnings };
}
