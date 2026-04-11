"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleJarvisMessage = handleJarvisMessage;
exports.approveJarvisAction = approveJarvisAction;
const intentParser_service_1 = require("../services/intentParser.service");
const commandRouter_service_1 = require("../services/commandRouter.service");
const responseFormatter_service_1 = require("../services/responseFormatter.service");
const voiceAdapter_service_1 = require("../../control-layer/voiceAdapter.service");
const approval_service_1 = require("../../control-layer/approval.service");
const controlRules_service_1 = require("../../control-layer/controlRules.service");
function extractMoney(message) {
    const m = message.match(/\$?\s*(\d{2,6})/);
    if (!m)
        return 0;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : 0;
}
function toControlAction(input) {
    const msg = input.normalizedMessage.toLowerCase();
    const changesProductionStatus = msg.includes("move") && msg.includes("production");
    const externalCommunication = msg.includes("follow up") ||
        msg.includes("send ") ||
        msg.includes("email") ||
        msg.includes("text");
    const amount = extractMoney(input.message);
    return {
        intent: input.parsedIntent.intent,
        message: input.normalizedMessage,
        parsedIntent: input.parsedIntent,
        amount,
        orderValue: amount,
        changesProductionStatus,
        externalCommunication
    };
}
async function handleJarvisMessage(req, res) {
    try {
        const body = typeof req.body === "object" && req.body !== null
            ? req.body
            : {};
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) {
            return res.status(400).json({
                success: false,
                error: "message is required"
            });
        }
        const normalized = (0, voiceAdapter_service_1.normalizeVoiceInput)(message);
        const parsed = (0, intentParser_service_1.parseIntent)(normalized);
        const action = toControlAction({
            message,
            normalizedMessage: normalized,
            parsedIntent: parsed
        });
        const rules = (0, controlRules_service_1.evaluateControlRules)(action);
        const approvalCheck = (0, approval_service_1.requiresApproval)(action);
        if (!rules.allowed && approvalCheck.requiresApproval) {
            const approval = (0, approval_service_1.createApprovalRequest)(action);
            return res.json({
                success: true,
                requiresApproval: true,
                approvalId: approval.approvalId,
                message: `${approval.message} ${approvalCheck.reason}`
            });
        }
        if (!rules.allowed) {
            return res.status(400).json({
                success: false,
                message: rules.reason
            });
        }
        const routed = await (0, commandRouter_service_1.routeIntent)(parsed);
        const out = (0, responseFormatter_service_1.formatJarvisResponse)(parsed.intent, routed.result);
        return res.json({
            success: true,
            executed: true,
            message: out.summary,
            intent: out.intent,
            data: out.data
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Jarvis error"
        });
    }
}
async function approveJarvisAction(req, res) {
    try {
        const body = typeof req.body === "object" && req.body !== null
            ? req.body
            : {};
        const approvalId = String(body.approvalId ?? "").trim();
        if (!approvalId) {
            return res.status(400).json({
                success: false,
                error: "approvalId is required"
            });
        }
        const out = await (0, approval_service_1.approveAction)(approvalId);
        if (!out.success) {
            return res.status(404).json(out);
        }
        return res.json({
            success: true,
            executed: true,
            message: out.message,
            data: out.result
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Approval error"
        });
    }
}
