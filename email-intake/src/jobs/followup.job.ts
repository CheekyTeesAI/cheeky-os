import cron from "node-cron";
import { db } from "../db/client";
import {
  getUnpaidInvoicesWithoutFollowup,
  markFollowupSent
} from "../db/repositories/invoice.repo";
import { sendEmail } from "../services/email.service";
import { logger } from "../utils/logger";

/** Every 30 minutes. */
const CRON_EXPRESSION = "*/30 * * * *";

const REMINDER_SUBJECT = "Reminder: Your Cheeky Tees Invoice";
const REMINDER_BODY =
  "Just a reminder — your invoice is still open. Let us know if you need anything.";

async function runFollowupBatch(): Promise<void> {
  const runId = new Date().toISOString();
  logger.info(`[FOLLOWUP] batch start runId=${runId}`);

  const invoices = await getUnpaidInvoicesWithoutFollowup();
  if (invoices.length === 0) {
    logger.info("[FOLLOWUP] no matching invoices (unpaid, no follow-up, age > 1h)");
    return;
  }

  logger.info(`[FOLLOWUP] candidates=${invoices.length}`);

  for (const inv of invoices) {
    try {
      const customer = await db.customer.findUnique({
        where: { id: inv.customerId }
      });
      const to = customer?.email?.trim();
      if (!to) {
        logger.warn(`[FOLLOWUP] skip invoiceDbId=${inv.id} (no customer email)`);
        continue;
      }

      await sendEmail(to, REMINDER_SUBJECT, REMINDER_BODY);
      await markFollowupSent(inv.id);

      logger.info(
        `[FOLLOWUP] OK invoiceDbId=${inv.id} squareInvoiceId=${inv.hash} to=${to}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[FOLLOWUP] ERR invoiceDbId=${inv.id}: ${message}`);
    }
  }

  logger.info(`[FOLLOWUP] batch end runId=${runId}`);
}

/**
 * Schedules unpaid-invoice reminder emails every 30 minutes.
 */
export function startFollowupJob(): void {
  cron.schedule(CRON_EXPRESSION, () => {
    void runFollowupBatch();
  });
  logger.info(`[FOLLOWUP] cron scheduled: ${CRON_EXPRESSION} (every 30 minutes)`);
}

/** Exposed for manual testing without waiting for the schedule. */
export function runFollowupOnce(): Promise<void> {
  return runFollowupBatch();
}
