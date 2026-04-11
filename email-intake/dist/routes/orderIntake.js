"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const orderEvaluator_1 = require("../services/orderEvaluator");
const sharepointOrderSync_1 = require("../services/sharepointOrderSync");
const teamsNotificationService_1 = require("../services/teamsNotificationService");
const logger_1 = require("../utils/logger");
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
        const order = await client_1.db.order.create({
            data: {
                customerName: customerName.trim(),
                email: email.trim(),
                phone,
                notes: notes.trim(),
                quotedAmount: optFiniteNumber(body.quotedAmount),
                estimatedCost: optFiniteNumber(body.estimatedCost),
                quantity: optInt(body.quantity),
                garmentType,
                printMethod,
                status: "INTAKE",
            },
        });
        const evaluated = await (0, orderEvaluator_1.evaluateOrderById)(order.id);
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
