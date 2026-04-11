"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const emailIntakeParser_1 = require("../services/emailIntakeParser");
const emailIntakeOrderService_1 = require("../services/emailIntakeOrderService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
function str(v) {
    return typeof v === "string" ? v.trim() : "";
}
function buildBodyWithOutlookMeta(baseBody, receivedAt, attachments) {
    let out = baseBody;
    if (receivedAt && receivedAt.trim()) {
        out += `\n\n[Outlook receivedAt: ${receivedAt.trim()}]`;
    }
    if (attachments && attachments.length > 0) {
        const lines = attachments.map((a) => {
            const n = a.name?.trim() || "(attachment)";
            const ct = a.contentType?.trim();
            const u = a.url?.trim();
            let s = `- ${n}`;
            if (ct)
                s += ` [${ct}]`;
            if (u)
                s += ` ${u}`;
            return s;
        });
        out += `\n\n[Attachments]\n${lines.join("\n")}`;
    }
    return out;
}
router.post("/api/intake/outlook-webhook", async (req, res) => {
    try {
        const body = req.body ?? {};
        const fromEmail = str(body.fromEmail);
        const subject = str(body.subject);
        const bodyText = str(body.body);
        const fromName = str(body.fromName);
        const receivedAt = typeof body.receivedAt === "string" ? body.receivedAt : undefined;
        const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
        const attachments = Array.isArray(body.attachments) ? body.attachments : undefined;
        if (!fromEmail || !subject || !bodyText) {
            res.status(400).json({
                success: false,
                error: "Missing required fields",
            });
            return;
        }
        if (messageId) {
            const dup = await (0, emailIntakeOrderService_1.findDuplicateOutlookIntake)(messageId);
            if (dup) {
                res.json({
                    success: true,
                    duplicate: true,
                    message: "Message already processed",
                });
                return;
            }
        }
        const bodyForParser = buildBodyWithOutlookMeta(bodyText, receivedAt, attachments);
        const parsed = (0, emailIntakeParser_1.parseEmailIntake)({
            fromName,
            fromEmail,
            subject,
            body: bodyForParser,
        });
        const extraNotesLines = [];
        if (messageId) {
            extraNotesLines.push(`Outlook messageId: ${messageId}`);
        }
        const pipeline = await (0, emailIntakeOrderService_1.executeEmailIntakePipeline)(parsed, {
            outlookMessageId: messageId || null,
            extraNotes: extraNotesLines.length > 0 ? extraNotesLines.join("\n") : undefined,
        });
        if (!pipeline.teamsIntake.success) {
            logger_1.logger.warn(`Outlook webhook Teams notifyNewIntake failed for ${pipeline.order.id}: ${pipeline.teamsIntake.error}`);
        }
        if (pipeline.teamsBlocked && !pipeline.teamsBlocked.success) {
            logger_1.logger.warn(`Outlook webhook Teams notifyBlockedOrder failed for ${pipeline.order.id}: ${pipeline.teamsBlocked.error}`);
        }
        res.json({
            success: true,
            parsed: pipeline.parsed,
            order: pipeline.order,
            source: "outlook-webhook",
            integrations: {
                sharepoint: pipeline.sharepoint,
                teams: {
                    intake: pipeline.teamsIntake,
                    blocked: pipeline.teamsBlocked,
                },
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process Outlook intake";
        res.status(500).json({ success: false, error: message });
    }
});
exports.default = router;
