"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishAndSendSquareInvoiceForOrder = publishAndSendSquareInvoiceForOrder;
const client_1 = require("../db/client");
const squareClient_1 = require("../lib/squareClient");
const orderEvaluator_1 = require("./orderEvaluator");
const safetyGuard_service_1 = require("./safetyGuard.service");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const teamsNotificationService_1 = require("./teamsNotificationService");
const logger_1 = require("../utils/logger");
const exceptionReviewService_1 = require("./exceptionReviewService");
function addDays(d, days) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + days);
    return x;
}
async function publishAndSendSquareInvoiceForOrder(orderId) {
    const id = String(orderId ?? "").trim();
    if (!id) {
        throw new Error("Missing order id");
    }
    const order = await client_1.db.order.findUnique({ where: { id } });
    if (!order) {
        throw new orderEvaluator_1.OrderNotFoundError(id);
    }
    if (order.squareInvoicePublished === true) {
        const sid = order.squareInvoiceId ?? "";
        if (!sid) {
            return {
                success: true,
                published: true,
                message: "Invoice already published",
                orderId: order.id,
                squareInvoiceId: "",
            };
        }
        return {
            success: true,
            published: true,
            message: "Invoice already published",
            orderId: order.id,
            squareInvoiceId: sid,
        };
    }
    (0, safetyGuard_service_1.assertActionAllowed)(order, "PUBLISH_INVOICE");
    const squareInvoiceId = (order.squareInvoiceId ?? "").trim();
    if (!squareInvoiceId) {
        throw new Error("Draft invoice does not exist");
    }
    const statusUpper = String(order.status ?? "").toUpperCase();
    if (statusUpper !== "INVOICE_DRAFTED") {
        throw new Error(`Order status must be INVOICE_DRAFTED to publish (current: ${order.status})`);
    }
    try {
        await (0, squareClient_1.publishSquareInvoice)(squareInvoiceId);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        (0, exceptionReviewService_1.logExceptionReviewSafe)({
            orderId: order.id,
            jobId: null,
            type: "INVOICE_PUBLISH_FAILED",
            source: "INVOICE_PUBLISH",
            severity: "HIGH",
            message: msg.slice(0, 2000),
            detailsJson: JSON.stringify({ squareInvoiceId }),
        });
        throw e;
    }
    const sentAt = new Date();
    const quoteExpiresAt = order.quoteExpiresAt ?? addDays(sentAt, 14);
    await client_1.db.order.update({
        where: { id: order.id },
        data: {
            squareInvoicePublished: true,
            squareInvoiceSentAt: sentAt,
            quoteExpiresAt,
            status: "QUOTE_SENT",
        },
    });
    try {
        await (0, sharepointOrderSync_1.syncOrderToSharePoint)(order.id);
    }
    catch (spErr) {
        const msg = spErr instanceof Error ? spErr.message : String(spErr);
        logger_1.logger.warn(`publishSquareInvoice: SharePoint sync failed for ${order.id}: ${msg}`);
    }
    try {
        const teams = await (0, teamsNotificationService_1.notifyQuoteSent)(order.id);
        if (teams.success === false) {
            logger_1.logger.warn(`publishSquareInvoice: Teams notifyQuoteSent failed for ${order.id}: ${teams.error}`);
        }
    }
    catch (e) {
        logger_1.logger.warn(`publishSquareInvoice: Teams notifyQuoteSent threw for ${order.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return {
        success: true,
        orderId: order.id,
        squareInvoiceId,
        published: true,
        sentAt: sentAt.toISOString(),
    };
}
