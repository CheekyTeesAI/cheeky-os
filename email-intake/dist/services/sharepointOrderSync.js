"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncOrderToSharePoint = syncOrderToSharePoint;
const sharepointClient_1 = require("../lib/sharepointClient");
const client_1 = require("../db/client");
const orderEvaluator_1 = require("./orderEvaluator");
const exceptionReviewService_1 = require("./exceptionReviewService");
const logger_1 = require("../utils/logger");
function orderToSharePointFields(order) {
    return {
        Title: order.customerName,
        Email: order.email,
        Phone: order.phone ?? null,
        Notes: order.notes,
        Status: order.status,
        QuotedAmount: order.quotedAmount ?? null,
        EstimatedCost: order.estimatedCost ?? null,
        Margin: order.margin ?? null,
        PPH: order.pph ?? null,
        DepositRequired: order.depositRequired ?? null,
        DepositReceived: order.depositReceived,
        Quantity: order.quantity ?? null,
        GarmentType: order.garmentType ?? null,
        PrintMethod: order.printMethod ?? null,
        BlockedReason: order.blockedReason ?? null,
        IsApproved: order.isApproved,
        ExternalOrderId: order.id,
    };
}
async function syncOrderToSharePoint(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        throw new orderEvaluator_1.OrderNotFoundError(orderId);
    }
    const fields = orderToSharePointFields(order);
    try {
        const existing = await (0, sharepointClient_1.findListItemByOrderId)(orderId);
        if (existing) {
            await (0, sharepointClient_1.updateListItem)(existing.id, fields);
            logger_1.logger.info(`SharePoint sync: updated list item for order ${orderId}`);
            return { success: true, action: "updated" };
        }
        await (0, sharepointClient_1.createListItem)(fields);
        logger_1.logger.info(`SharePoint sync: created list item for order ${orderId}`);
        return { success: true, action: "created" };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        (0, exceptionReviewService_1.logExceptionReviewSafe)({
            orderId,
            jobId: null,
            type: "SHAREPOINT_SYNC_FAILED",
            source: "SHAREPOINT",
            severity: "MEDIUM",
            message: msg.slice(0, 2000),
            detailsJson: null,
        });
        throw e;
    }
}
