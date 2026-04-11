"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLead = createLead;
exports.logActivity = logActivity;
exports.getPipeline = getPipeline;
exports.getDashboard = getDashboard;
exports.createDraftEstimate = createDraftEstimate;
exports.getNextActions = getNextActions;
exports.executeAction = executeAction;
exports.runBusiness = runBusiness;
const lead_service_1 = require("../services/lead.service");
const activity_service_1 = require("../services/activity.service");
const dashboard_service_1 = require("../services/dashboard.service");
const squareEstimate_service_1 = require("../services/squareEstimate.service");
const response_1 = require("../utils/response");
const systemState_service_1 = require("../../core/services/systemState.service");
const decisionEngine_service_1 = require("../../decision-engine/decisionEngine.service");
const autoOperator_service_1 = require("../../auto-operator/autoOperator.service");
const actionExecutor_service_1 = require("../../auto-operator/actionExecutor.service");
const safetyGuard_service_1 = require("../../auto-operator/safetyGuard.service");
function createLead(req, res) {
    try {
        const lead = (0, lead_service_1.createLead)(req.body);
        return res.json((0, response_1.successResponse)(lead, "Lead created"));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create lead";
        return res.status(400).json((0, response_1.errorResponse)("Lead creation failed", [message]));
    }
}
function logActivity(req, res) {
    try {
        const activity = (0, activity_service_1.logActivity)(req.body);
        return res.json((0, response_1.successResponse)(activity, "Activity logged"));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to log activity";
        return res.status(400).json((0, response_1.errorResponse)("Activity logging failed", [message]));
    }
}
async function getPipeline(_req, res) {
    try {
        const system = await (0, systemState_service_1.getSystemState)();
        const pipeline = {
            salesPipeline: system.salesPipeline,
            productionQueue: system.productionQueue,
            orders: system.orders,
            tasks: system.tasks
        };
        return res.json((0, response_1.successResponse)(pipeline, "Pipeline loaded"));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load pipeline";
        return res.status(500).json((0, response_1.errorResponse)("Pipeline load failed", [message]));
    }
}
async function getDashboard(_req, res) {
    try {
        const system = await (0, systemState_service_1.getSystemState)();
        const legacy = (0, dashboard_service_1.getTodayDashboard)();
        const dashboard = {
            totals: {
                activeOrders: system.orders.length,
                activeTasks: system.tasks.length,
                activeLeads: system.leads.length
            },
            productionQueueTop: system.productionQueue.slice(0, 10),
            salesPipelineTop: system.salesPipeline.slice(0, 10),
            legacy
        };
        return res.json((0, response_1.successResponse)(dashboard, "Dashboard loaded"));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load dashboard";
        return res.status(500).json((0, response_1.errorResponse)("Dashboard load failed", [message]));
    }
}
async function createDraftEstimate(req, res) {
    try {
        const svc = new squareEstimate_service_1.SquareEstimateServicePlaceholder();
        const out = svc.createDraftEstimate
            ? await svc.createDraftEstimate(req.body)
            : { estimateId: "mock-id", status: "DRAFT" };
        return res.json((0, response_1.successResponse)(out, "Draft estimate created"));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create draft estimate";
        return res.status(500).json((0, response_1.errorResponse)("Draft estimate failed", [message]));
    }
}
async function getNextActions(_req, res) {
    try {
        const actions = await (0, decisionEngine_service_1.getNextBestActions)();
        return res.json({
            success: true,
            actions
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load next actions";
        return res.status(500).json((0, response_1.errorResponse)("Next actions failed", [message]));
    }
}
function executeAction(req, res) {
    try {
        const body = typeof req.body === "object" && req.body !== null
            ? req.body
            : {};
        const action = String(body.action ?? "").trim();
        const target = String(body.target ?? "").trim();
        if (!action) {
            return res.status(400).json((0, response_1.errorResponse)("Invalid action", ["action is required"]));
        }
        const actionType = (0, safetyGuard_service_1.classifyActionType)(action);
        if (actionType === "UNKNOWN") {
            return res.status(400).json((0, response_1.errorResponse)("Invalid action", ["action is unclear"]));
        }
        void (0, actionExecutor_service_1.executeAction)({
            type: actionType,
            action,
            target: target || null
        })
            .then((out) => {
            console.log(`[EXECUTE_ACTION] ts=${new Date().toISOString()} action=${action} result=${out.result}`);
        })
            .catch(() => {
            // no-op
        });
        return res.json({
            success: true,
            logged: true,
            action,
            target: target || null,
            result: "queued"
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to execute action";
        return res.status(500).json((0, response_1.errorResponse)("Execute action failed", [message]));
    }
}
async function runBusiness(req, res) {
    try {
        const body = typeof req.body === "object" && req.body !== null
            ? req.body
            : {};
        const mode = String(body.mode ?? "").trim().toLowerCase() === "dry-run" ? "dry-run" : "execute";
        const out = await (0, autoOperator_service_1.runAutoOperator)(mode);
        return res.json({
            success: true,
            mode,
            ...out
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to run auto operator";
        return res.status(500).json((0, response_1.errorResponse)("Run business failed", [message]));
    }
}
