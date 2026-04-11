"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeIntent = routeIntent;
const command_controller_1 = require("../../command-layer/controllers/command.controller");
const decisionEngine_service_1 = require("../../decision-engine/decisionEngine.service");
const autoOperator_service_1 = require("../../auto-operator/autoOperator.service");
const warRoom_controller_1 = require("../../command-layer/controllers/warRoom.controller");
function createMockReq(body) {
    return { body };
}
function createMockRes() {
    const state = { statusCode: 200, body: null };
    const res = {
        status: (code) => {
            state.statusCode = code;
            return res;
        },
        json: (payload) => {
            state.body = payload;
            return res;
        }
    };
    return { res, state };
}
async function runExecuteCommand(command, message) {
    const req = createMockReq({ command, message });
    const { res, state } = createMockRes();
    await (0, command_controller_1.executeCommand)(req, res);
    return state.body;
}
async function runWarRoom() {
    const req = createMockReq({});
    const { res, state } = createMockRes();
    await (0, warRoom_controller_1.getWarRoom)(req, res);
    return state.body;
}
async function routeIntent(parsed) {
    switch (parsed.intent) {
        case "RUN_BUSINESS":
            return {
                intent: parsed.intent,
                command: "run-business",
                result: await (0, autoOperator_service_1.runAutoOperator)("execute")
            };
        case "NEXT_ACTIONS":
            return {
                intent: parsed.intent,
                command: "next-actions",
                result: await (0, decisionEngine_service_1.getNextBestActions)()
            };
        case "SYNC_BRAIN":
            return {
                intent: parsed.intent,
                command: "sync-brain",
                result: {
                    synced: true,
                    note: parsed.extractedData?.note || "",
                    capturedAt: new Date().toISOString()
                }
            };
        case "SCHEDULE_DAY":
            return {
                intent: parsed.intent,
                command: "schedule-day",
                result: await runExecuteCommand("schedule-day")
            };
        case "FOLLOW_UP_LEADS":
            return {
                intent: parsed.intent,
                command: "auto-followup",
                result: await runExecuteCommand("followups")
            };
        case "CLOSE_DEALS":
            return {
                intent: parsed.intent,
                command: "close-deals",
                result: await runExecuteCommand("close-deals")
            };
        case "REVIVE_PIPELINE":
            return {
                intent: parsed.intent,
                command: "revive-pipeline",
                result: await runExecuteCommand("revive-pipeline")
            };
        case "GENERATE_REVENUE":
            return {
                intent: parsed.intent,
                command: "generate-revenue",
                result: await runExecuteCommand("generate-revenue")
            };
        case "SHOP_STATUS":
            return {
                intent: parsed.intent,
                command: "war-room",
                result: await runWarRoom()
            };
        default:
            return {
                intent: "UNKNOWN",
                command: null,
                result: {
                    success: false,
                    message: "Unknown command",
                    availableCommands: [
                        "run-business",
                        "next-actions",
                        "schedule-day",
                        "auto-followup",
                        "close-deals",
                        "revive-pipeline",
                        "generate-revenue",
                        "war-room",
                        "sync-brain"
                    ]
                }
            };
    }
}
