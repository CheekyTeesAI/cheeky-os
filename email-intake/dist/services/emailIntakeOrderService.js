"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDuplicateOutlookIntake = findDuplicateOutlookIntake;
exports.executeEmailIntakePipeline = executeEmailIntakePipeline;
const client_1 = require("../db/client");
const orderEvaluator_1 = require("./orderEvaluator");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const teamsNotificationService_1 = require("./teamsNotificationService");
const logger_1 = require("../utils/logger");
async function findDuplicateOutlookIntake(messageId) {
    const trimmed = messageId.trim();
    if (!trimmed)
        return null;
    return client_1.db.order.findFirst({
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
    const order = await client_1.db.order.create({
        data: {
            customerName: parsed.customerName,
            email: parsed.email,
            phone: parsed.phone ?? undefined,
            notes,
            quantity: parsed.quantity ?? undefined,
            garmentType: parsed.garmentType ?? undefined,
            printMethod: parsed.printMethod ?? undefined,
            quotedAmount: parsed.quotedAmount ?? undefined,
            estimatedCost: parsed.estimatedCost ?? undefined,
            status: "INTAKE",
            outlookMessageId: options.outlookMessageId?.trim() || undefined,
        },
    });
    const evaluated = await (0, orderEvaluator_1.evaluateOrderById)(order.id);
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
