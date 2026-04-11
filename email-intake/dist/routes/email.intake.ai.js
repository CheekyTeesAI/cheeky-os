"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const brain_1 = require("../core/brain");
const client_1 = require("../db/client");
const taskGenerator_1 = require("../services/taskGenerator");
const estimateSendService_1 = require("../services/estimateSendService");
const salesAgent_1 = require("../services/salesAgent");
const router = (0, express_1.Router)();
function asString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function mapProductionType(printMethod) {
    const pm = printMethod.trim().toUpperCase().replace(/[_\s-]+/g, "_");
    if (pm === "DTG" || pm === "SCREEN" || pm === "DTF" || pm === "HEAT_PRESS")
        return pm;
    if (pm === "HEATPRESS")
        return "HEAT_PRESS";
    return "OTHER";
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
router.post("/email/intake", async (req, res) => {
    try {
        const from = asString(req.body?.from);
        const subject = asString(req.body?.subject);
        const body = asString(req.body?.body);
        const parserInput = `Subject: ${subject}\n\nBody:\n${body}`;
        const parsed = await (0, brain_1.brain)(parserInput);
        const parsedCustomerName = asString(parsed?.customerName);
        const parsedEmail = asString(parsed?.email);
        const customerEmail = parsedEmail || from;
        const customerName = parsedCustomerName || "Unknown Customer";
        if (!customerEmail) {
            console.error("[email.intake.ai] Missing customer email (from + parser)");
            res.status(200).json({ status: "NEEDS_REVIEW" });
            return;
        }
        const customer = await client_1.db.customer.upsert({
            where: { email: customerEmail },
            update: { name: customerName },
            create: { email: customerEmail, name: customerName },
            select: { id: true },
        });
        const parseSuccess = String(parsed?.intent || "").toUpperCase() === "CREATE_INVOICE";
        const quantity = Number(parsed?.quantity ?? 0);
        const unitPrice = Number(parsed?.unitPrice ?? 0);
        const printMethod = asString(parsed?.printMethod);
        const parsedNotes = asString(parsed?.notes);
        const parsedItems = Array.isArray(parsed?.items) ? parsed.items : [];
        const isComplete = parseSuccess && quantity > 0 && unitPrice > 0;
        const status = isComplete ? "QUOTE" : "NEEDS_REVIEW";
        const orderData = {
            orderNumber: `CHK-${Date.now()}`,
            customerId: customer.id,
            status,
            source: "EMAIL",
            totalAmount: isComplete ? quantity * unitPrice : 0,
            depositAmount: 0,
            notes: isComplete ? (parsedNotes || undefined) : body,
        };
        const order = await client_1.db.order.create({
            data: orderData,
            select: { id: true },
        });
        if (isComplete && parsedItems.length > 0) {
            const defaultProductionType = mapProductionType(printMethod);
            await client_1.db.lineItem.createMany({
                data: parsedItems.map((item) => {
                    const itemQuantity = Number(item?.quantity ?? quantity ?? 1);
                    const itemUnitPrice = Number(item?.unitPrice ?? unitPrice ?? 0);
                    const itemPrintMethod = asString(item?.printMethod) || printMethod;
                    const description = asString(item?.description) || subject || "Email intake item";
                    return {
                        orderId: order.id,
                        description,
                        quantity: Number.isFinite(itemQuantity) && itemQuantity > 0 ? itemQuantity : 1,
                        unitPrice: Number.isFinite(itemUnitPrice) ? itemUnitPrice : 0,
                        productionType: mapProductionType(itemPrintMethod || defaultProductionType),
                        designRef: asString(item?.designRef) || undefined,
                    };
                }),
            });
        }
        try {
            const lineCount = await client_1.db.lineItem.count({ where: { orderId: order.id } });
            if (lineCount > 0 && isValidEmail(customerEmail)) {
                await (0, estimateSendService_1.sendEstimate)(order.id);
            }
        }
        catch (sendErr) {
            console.error("[email.intake.ai] sendEstimate failed (non-fatal)", sendErr);
        }
        const beforeCount = await client_1.db.task.count({ where: { orderId: order.id } });
        await (0, taskGenerator_1.generateTasksForOrder)(order.id);
        const afterCount = await client_1.db.task.count({ where: { orderId: order.id } });
        const tasksCreated = Math.max(0, afterCount - beforeCount);
        try {
            if (isValidEmail(customerEmail) &&
                (status === "QUOTE" || status === "NEEDS_REVIEW")) {
                await (0, salesAgent_1.runSalesAgentForOrder)(order.id, {
                    autoSend: false,
                    channel: "console",
                    reason: "new_lead",
                });
            }
        }
        catch (salesErr) {
            console.error("[email.intake.ai] sales agent (non-fatal)", salesErr);
        }
        if (!isComplete) {
            res.status(200).json({ orderId: order.id, status: "NEEDS_REVIEW" });
            return;
        }
        res.status(200).json({
            orderId: order.id,
            customerId: customer.id,
            tasksCreated,
        });
    }
    catch (error) {
        console.error("[email.intake.ai] Failed to process email intake", error);
        res.status(200).json({ status: "NEEDS_REVIEW" });
    }
});
exports.default = router;
