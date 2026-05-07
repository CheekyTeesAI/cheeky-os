"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDuplicateOutlookIntake = findDuplicateOutlookIntake;
exports.executeEmailIntakePipeline = executeEmailIntakePipeline;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const orderEvaluator_1 = require("./orderEvaluator");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const teamsNotificationService_1 = require("./teamsNotificationService");
const logger_1 = require("../utils/logger");
const artRoutingService_1 = require("./artRoutingService");
const proofRoutingService_1 = require("./proofRoutingService");
async function findDuplicateOutlookIntake(messageId) {
    const trimmed = messageId.trim();
    if (!trimmed)
        return null;
    return client_2.db.order.findFirst({
        where: {
            OR: [
                { outlookMessageId: trimmed },
                { notes: { contains: trimmed } },
            ],
        },
    });
}
async function executeEmailIntakePipeline(parsed, options = {}) {
    const extra = options.extraNotes?.trim();
    let notes = parsed.notes;
    if (extra) {
        notes = notes.trim().length > 0 ? `${notes}\n\n${extra}` : extra;
    }
    const quotedAmount = parsed.quotedAmount ?? undefined;
    const totalAmount = parsed.quotedAmount != null && parsed.quotedAmount > 0
        ? parsed.quotedAmount
        : 0;
    const depositRequired = totalAmount > 0 ? Math.round(totalAmount * 0.5 * 100) / 100 : undefined;
    const order = await client_2.db.order.create({
        data: {
            customerName: parsed.customerName,
            email: parsed.email,
            phone: parsed.phone ?? undefined,
            notes,
            quantity: parsed.quantity ?? undefined,
            garmentType: parsed.garmentType ?? undefined,
            printMethod: parsed.printMethod ?? undefined,
            quotedAmount,
            totalAmount,
            depositRequired,
            estimatedCost: parsed.estimatedCost ?? undefined,
            status: "QUOTE_SENT",
            depositStatus: client_1.OrderDepositStatus.NONE,
            outlookMessageId: options.outlookMessageId?.trim() || undefined,
            artFileStatus: artRoutingService_1.ART_STATUS.NOT_READY,
            proofRequired: true,
            proofStatus: proofRoutingService_1.PROOF_STATUS.NOT_SENT,
        },
    });
    const evaluated = await (0, orderEvaluator_1.evaluateOrderById)(order.id);
    try {
        await (0, artRoutingService_1.ensureArtPrepTask)(evaluated.id);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger_1.logger.warn(`ensureArtPrepTask after email intake ${evaluated.id}: ${msg}`);
    }
    try {
        await (0, proofRoutingService_1.ensureProofApprovalTask)(evaluated.id);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger_1.logger.warn(`ensureProofApprovalTask after email intake ${evaluated.id}: ${msg}`);
    }
    let sharepoint = { success: true };
    try {
        await (0, sharepointOrderSync_1.syncOrderToSharePoint)(evaluated.id);
    }
    catch (spErr) {
        const msg = spErr instanceof Error ? spErr.message : "SharePoint sync failed";
        logger_1.logger.warn(`Email intake pipeline SharePoint failed for ${evaluated.id}: ${msg}`);
        sharepoint = { success: false, error: msg };
    }
    const teamsIntakeResult = await (0, teamsNotificationService_1.notifyNewIntake)(evaluated.id);
    const teamsIntake = teamsIntakeResult.success === true
        ? { success: true }
        : {
            success: false,
            error: teamsIntakeResult.error,
        };
    let teamsBlocked;
    if (evaluated.status === "BLOCKED") {
        const tb = await (0, teamsNotificationService_1.notifyBlockedOrder)(evaluated.id);
        teamsBlocked =
            tb.success === true
                ? { success: true }
                : { success: false, error: tb.error };
    }
    return {
        parsed,
        order: evaluated,
        sharepoint,
        teamsIntake,
        teamsBlocked,
    };
}
