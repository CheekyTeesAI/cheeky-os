"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDay = runDay;
const followup_controller_1 = require("./followup.controller");
const pipeline_service_1 = require("../services/pipeline.service");
const response_1 = require("../utils/response");
function extractFollowupSummary(payload) {
    const obj = typeof payload === "object" && payload !== null ? payload : {};
    return {
        sent: typeof obj.sent === "number" ? obj.sent : 0,
        failed: typeof obj.failed === "number" ? obj.failed : 0
    };
}
async function runDay(_req, res) {
    try {
        (0, pipeline_service_1.getPipeline)();
        const nextBestActions = (0, pipeline_service_1.getNextBestActions)();
        const priorityDeals = nextBestActions.slice(0, 3).map((deal) => ({
            name: deal.name,
            value: deal.value,
            action: deal.recommendedAction,
            script: deal.script
        }));
        let followupPayload = { sent: 0, failed: 0 };
        const fakeRes = {
            status: (_code) => fakeRes,
            json: (body) => {
                followupPayload = body;
                return fakeRes;
            }
        };
        await (0, followup_controller_1.autoFollowup)({}, fakeRes);
        const followups = extractFollowupSummary(followupPayload);
        return res.json({
            success: true,
            plan: {
                priorityDeals,
                actions: priorityDeals.map((d) => d.action),
                followups
            }
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to run day plan";
        return res.status(500).json((0, response_1.errorResponse)("Run day failed", [message]));
    }
}
