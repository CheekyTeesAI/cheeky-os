"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFollowupJob = startFollowupJob;
exports.runFollowupOnce = runFollowupOnce;
const node_cron_1 = __importDefault(require("node-cron"));
const client_1 = require("../db/client");
const invoice_repo_1 = require("../db/repositories/invoice.repo");
const email_service_1 = require("../services/email.service");
const logger_1 = require("../utils/logger");
/** Every 30 minutes. */
const CRON_EXPRESSION = "*/30 * * * *";
const REMINDER_SUBJECT = "Reminder: Your Cheeky Tees Invoice";
const REMINDER_BODY = "Just a reminder — your invoice is still open. Let us know if you need anything.";
async function runFollowupBatch() {
    const runId = new Date().toISOString();
    logger_1.logger.info(`[FOLLOWUP] batch start runId=${runId}`);
    const invoices = await (0, invoice_repo_1.getUnpaidInvoicesWithoutFollowup)();
    if (invoices.length === 0) {
        logger_1.logger.info("[FOLLOWUP] no matching invoices (unpaid, no follow-up, age > 1h)");
        return;
    }
    logger_1.logger.info(`[FOLLOWUP] candidates=${invoices.length}`);
    for (const inv of invoices) {
        try {
            const customer = await client_1.db.customer.findUnique({
                where: { id: inv.customerId }
            });
            const to = customer?.email?.trim();
            if (!to) {
                logger_1.logger.warn(`[FOLLOWUP] skip invoiceDbId=${inv.id} (no customer email)`);
                continue;
            }
            await (0, email_service_1.sendEmail)(to, REMINDER_SUBJECT, REMINDER_BODY);
            await (0, invoice_repo_1.markFollowupSent)(inv.id);
            logger_1.logger.info(`[FOLLOWUP] OK invoiceDbId=${inv.id} squareInvoiceId=${inv.hash} to=${to}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error(`[FOLLOWUP] ERR invoiceDbId=${inv.id}: ${message}`);
        }
    }
    logger_1.logger.info(`[FOLLOWUP] batch end runId=${runId}`);
}
/**
 * Schedules unpaid-invoice reminder emails every 30 minutes.
 */
function startFollowupJob() {
    node_cron_1.default.schedule(CRON_EXPRESSION, () => {
        void runFollowupBatch();
    });
    logger_1.logger.info(`[FOLLOWUP] cron scheduled: ${CRON_EXPRESSION} (every 30 minutes)`);
}
/** Exposed for manual testing without waiting for the schedule. */
function runFollowupOnce() {
    return runFollowupBatch();
}
