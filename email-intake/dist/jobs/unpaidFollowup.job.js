"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUnpaidFollowup = runUnpaidFollowup;
const client_1 = require("../db/client");
const email_service_1 = require("../services/email.service");
const logger_1 = require("../utils/logger");
/**
 * Follow-up on unpaid invoices/orders after 24 hours.
 *
 * Uses Order.followUpSent to ensure no duplicates.
 */
async function runUnpaidFollowup() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unpaidOrders = await client_1.db.order.findMany({
        where: {
            status: "SENT",
            followUpSent: false,
            createdAt: { lt: cutoff }
        }
    });
    if (unpaidOrders.length === 0) {
        logger_1.logger.info("[UNPAID-FOLLOWUP] no unpaid orders to follow up");
        return;
    }
    logger_1.logger.info(`[UNPAID-FOLLOWUP] candidates=${unpaidOrders.length}`);
    for (const order of unpaidOrders) {
        try {
            // Order stores `customerName`; resolve actual email from Customer table.
            const customer = await client_1.db.customer.findFirst({
                where: { name: order.customerName }
            });
            const to = customer?.email?.trim();
            if (!to) {
                logger_1.logger.warn(`[UNPAID-FOLLOWUP] skip orderId=${order.id} (no customer email)`);
                continue;
            }
            await (0, email_service_1.sendEmail)(to, "Reminder: Your Cheeky Tees Order", "Hey — just a quick reminder to complete your order so we can start production.");
            await client_1.db.order.update({
                where: { id: order.id },
                data: { followUpSent: true }
            });
            logger_1.logger.info(`[UNPAID-FOLLOWUP] sent orderId=${order.id} to=${to} marked followUpSent=true`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error(`[UNPAID-FOLLOWUP] ERR orderId=${order.id}: ${message}`);
        }
    }
}
