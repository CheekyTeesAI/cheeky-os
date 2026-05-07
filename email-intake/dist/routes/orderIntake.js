"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const client_2 = require("../db/client");
const orderEvaluator_1 = require("../services/orderEvaluator");
const sharepointOrderSync_1 = require("../services/sharepointOrderSync");
const teamsNotificationService_1 = require("../services/teamsNotificationService");
const logger_1 = require("../utils/logger");
const artRoutingService_1 = require("../services/artRoutingService");
const proofRoutingService_1 = require("../services/proofRoutingService");
const router = (0, express_1.Router)();
function optFiniteNumber(value) {
    if (value === null || value === undefined)
        return undefined;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    return undefined;
}
function optInt(value) {
    const n = optFiniteNumber(value);
    if (n === undefined)
        return undefined;
    return Math.trunc(n);
}
router.post("/api/orders/intake", async (req, res) => {
    try {
        const body = req.body ?? {};
        const customerName = body.customerName;
        const email = body.email;
        const notes = body.notes;
        const nameOk = typeof customerName === "string" && customerName.trim().length > 0;
        const emailOk = typeof email === "string" && email.trim().length > 0;
        const notesOk = typeof notes === "string" && notes.trim().length > 0;
        if (!nameOk || !emailOk || !notesOk) {
            res.status(400).json({
                success: false,
                error: "Missing required fields",
            });
            return;
        }
        const phoneRaw = body.phone;
        const phone = typeof phoneRaw === "string" && phoneRaw.trim().length > 0
            ? phoneRaw.trim()
            : undefined;
        const garmentRaw = body.garmentType;
        const garmentType = typeof garmentRaw === "string" && garmentRaw.trim().length > 0
            ? garmentRaw.trim()
            : undefined;
        const methodRaw = body.printMethod;
        const printMethod = typeof methodRaw === "string" && methodRaw.trim().length > 0
            ? methodRaw.trim()
            : undefined;
        const quotedAmount = optFiniteNumber(body.quotedAmount);
        const totalAmount = optFiniteNumber(body.totalAmount) ??
            quotedAmount ??
            0;
        const depositRequired = optFiniteNumber(body.depositRequired) ??
            (totalAmount > 0 ? Math.round(totalAmount * 0.5 * 100) / 100 : undefined);
        const order = await client_2.db.order.create({
            data: {
                customerName: customerName.trim(),
                email: email.trim(),
                phone,
                notes: notes.trim(),
                quotedAmount,
                totalAmount,
                depositRequired,
                estimatedCost: optFiniteNumber(body.estimatedCost),
                quantity: optInt(body.quantity),
                garmentType,
                printMethod,
                status: "QUOTE_SENT",
                depositStatus: client_1.OrderDepositStatus.NONE,
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
            logger_1.logger.warn(`ensureArtPrepTask after intake ${evaluated.id}: ${msg}`);
        }
        try {
            await (0, proofRoutingService_1.ensureProofApprovalTask)(evaluated.id);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger_1.logger.warn(`ensureProofApprovalTask after intake ${evaluated.id}: ${msg}`);
        }
        let sharepoint;
        try {
            const spResult = await (0, sharepointOrderSync_1.syncOrderToSharePoint)(evaluated.id);
            sharepoint = { success: true, action: spResult.action };
        }
        catch (spErr) {
            const msg = spErr instanceof Error ? spErr.message : "SharePoint sync failed";
            logger_1.logger.warn(`Intake SharePoint sync skipped/failed for ${evaluated.id}: ${msg}`);
            sharepoint = { success: false, error: msg };
        }
        const teamsIntake = await (0, teamsNotificationService_1.notifyNewIntake)(evaluated.id);
        if (teamsIntake.success === false) {
            logger_1.logger.warn(`Teams notifyNewIntake failed for ${evaluated.id}: ${teamsIntake.error}`);
        }
        if (evaluated.status === "BLOCKED") {
            const teamsBlock = await (0, teamsNotificationService_1.notifyBlockedOrder)(evaluated.id);
            if (teamsBlock.success === false) {
                logger_1.logger.warn(`Teams notifyBlockedOrder failed for ${evaluated.id}: ${teamsBlock.error}`);
            }
        }
        res.json({ success: true, order: evaluated, sharepoint });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process intake";
        res.status(500).json({ success: false, error: message });
    }
});
exports.default = router;
