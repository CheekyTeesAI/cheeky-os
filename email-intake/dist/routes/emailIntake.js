"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const customerReplyClassifier_1 = require("../lib/customerReplyClassifier");
const emailIntakeParser_1 = require("../services/emailIntakeParser");
const emailIntakeOrderService_1 = require("../services/emailIntakeOrderService");
const customerReplyService_1 = require("../services/customerReplyService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.post("/api/intake/email", async (req, res) => {
    try {
        const body = req.body ?? {};
        const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail.trim() : "";
        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const bodyText = typeof body.body === "string" ? body.body.trim() : "";
        const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
        if (!fromEmail || !subject || !bodyText) {
            res.status(400).json({
                success: false,
                error: "Missing required fields: fromEmail, subject, body",
            });
            return;
        }
        if ((0, customerReplyClassifier_1.isLikelyCustomerReplyEmail)(subject, bodyText)) {
            try {
                const replyResult = await (0, customerReplyService_1.processInboundCustomerReply)({
                    subject,
                    body: bodyText,
                    fromEmail,
                    customerName: fromName || null,
                });
                return res.json({
                    success: true,
                    path: replyResult.path,
                    classification: replyResult.classification,
                    orderId: replyResult.orderId,
                    matchConfidence: replyResult.matchConfidence,
                    needsReview: replyResult.needsReview,
                    actions: replyResult.actions,
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger_1.logger.warn(`Customer reply handling failed: ${msg}`);
                return res.status(500).json({
                    success: false,
                    error: "Customer reply handling failed",
                });
            }
        }
        const parsed = (0, emailIntakeParser_1.parseEmailIntake)({
            fromName,
            fromEmail,
            subject,
            body: bodyText,
        });
        const pipeline = await (0, emailIntakeOrderService_1.executeEmailIntakePipeline)(parsed);
        if (!pipeline.teamsIntake.success) {
            logger_1.logger.warn(`Teams notifyNewIntake failed for ${pipeline.order.id}: ${pipeline.teamsIntake.error}`);
        }
        if (pipeline.teamsBlocked && !pipeline.teamsBlocked.success) {
            logger_1.logger.warn(`Teams notifyBlockedOrder failed for ${pipeline.order.id}: ${pipeline.teamsBlocked.error}`);
        }
        res.json({
            success: true,
            parsed: pipeline.parsed,
            order: pipeline.order,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process email intake";
        res.status(500).json({ success: false, error: message });
    }
});
exports.default = router;
