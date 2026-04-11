import { db } from "../db/client";
import { sendEmail } from "../services/email.service";
import { logger } from "../utils/logger";

/**
 * Follow-up on unpaid invoices/orders after 24 hours.
 *
 * Uses Order.followUpSent to ensure no duplicates.
 */
export async function runUnpaidFollowup(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const unpaidOrders = await db.order.findMany({
    where: {
      status: "SENT",
      followUpSent: false,
      createdAt: { lt: cutoff }
    }
  });

  if (unpaidOrders.length === 0) {
    logger.info("[UNPAID-FOLLOWUP] no unpaid orders to follow up");
    return;
  }

  logger.info(`[UNPAID-FOLLOWUP] candidates=${unpaidOrders.length}`);

  for (const order of unpaidOrders) {
    try {
      // Order stores `customerName`; resolve actual email from Customer table.
      const customer = await db.customer.findFirst({
        where: { name: order.customerName }
      });

      const to = customer?.email?.trim();
      if (!to) {
        logger.warn(
          `[UNPAID-FOLLOWUP] skip orderId=${order.id} (no customer email)`
        );
        continue;
      }

      await sendEmail(
        to,
        "Reminder: Your Cheeky Tees Order",
        "Hey — just a quick reminder to complete your order so we can start production."
      );

      await db.order.update({
        where: { id: order.id },
        data: { followUpSent: true }
      });

      logger.info(
        `[UNPAID-FOLLOWUP] sent orderId=${order.id} to=${to} marked followUpSent=true`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[UNPAID-FOLLOWUP] ERR orderId=${order.id}: ${message}`);
    }
  }
}

