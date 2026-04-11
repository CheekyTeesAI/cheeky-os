import type { Order } from "@prisma/client";
import {
  createListItem,
  findListItemByOrderId,
  updateListItem,
} from "../lib/sharepointClient";
import { db } from "../db/client";
import { OrderNotFoundError } from "./orderEvaluator";
import { logExceptionReviewSafe } from "./exceptionReviewService";
import { logger } from "../utils/logger";

function orderToSharePointFields(order: Order): Record<string, unknown> {
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

export async function syncOrderToSharePoint(
  orderId: string
): Promise<{ success: true; action: "created" | "updated" }> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  const fields = orderToSharePointFields(order);

  try {
    const existing = await findListItemByOrderId(orderId);
    if (existing) {
      await updateListItem(existing.id, fields);
      logger.info(`SharePoint sync: updated list item for order ${orderId}`);
      return { success: true, action: "updated" };
    }
    await createListItem(fields);
    logger.info(`SharePoint sync: created list item for order ${orderId}`);
    return { success: true, action: "created" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logExceptionReviewSafe({
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
