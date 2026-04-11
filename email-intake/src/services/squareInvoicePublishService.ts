import { db } from "../db/client";
import { publishSquareInvoice } from "../lib/squareClient";
import { OrderNotFoundError } from "./orderEvaluator";
import { assertActionAllowed } from "./safetyGuard.service";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import { notifyQuoteSent } from "./teamsNotificationService";
import { logger } from "../utils/logger";
import { logExceptionReviewSafe } from "./exceptionReviewService";

export type PublishAndSendSquareInvoiceResult =
  | {
      success: true;
      published: true;
      message: "Invoice already published";
      orderId: string;
      squareInvoiceId: string;
    }
  | {
      success: true;
      orderId: string;
      squareInvoiceId: string;
      published: true;
      sentAt: string;
    };

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

export async function publishAndSendSquareInvoiceForOrder(
  orderId: string
): Promise<PublishAndSendSquareInvoiceResult> {
  const id = String(orderId ?? "").trim();
  if (!id) {
    throw new Error("Missing order id");
  }

  const order = await db.order.findUnique({ where: { id } });
  if (!order) {
    throw new OrderNotFoundError(id);
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

  assertActionAllowed(order, "PUBLISH_INVOICE");

  const squareInvoiceId = (order.squareInvoiceId ?? "").trim();
  if (!squareInvoiceId) {
    throw new Error("Draft invoice does not exist");
  }

  const statusUpper = String(order.status ?? "").toUpperCase();
  if (statusUpper !== "INVOICE_DRAFTED") {
    throw new Error(
      `Order status must be INVOICE_DRAFTED to publish (current: ${order.status})`
    );
  }

  try {
    await publishSquareInvoice(squareInvoiceId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logExceptionReviewSafe({
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
  const quoteExpiresAt =
    order.quoteExpiresAt ?? addDays(sentAt, 14);

  await db.order.update({
    where: { id: order.id },
    data: {
      squareInvoicePublished: true,
      squareInvoiceSentAt: sentAt,
      quoteExpiresAt,
      status: "QUOTE_SENT",
    },
  });

  try {
    await syncOrderToSharePoint(order.id);
  } catch (spErr) {
    const msg =
      spErr instanceof Error ? spErr.message : String(spErr);
    logger.warn(
      `publishSquareInvoice: SharePoint sync failed for ${order.id}: ${msg}`
    );
  }

  try {
    const teams = await notifyQuoteSent(order.id);
    if (teams.success === false) {
      logger.warn(
        `publishSquareInvoice: Teams notifyQuoteSent failed for ${order.id}: ${teams.error}`
      );
    }
  } catch (e) {
    logger.warn(
      `publishSquareInvoice: Teams notifyQuoteSent threw for ${order.id}: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  return {
    success: true,
    orderId: order.id,
    squareInvoiceId,
    published: true,
    sentAt: sentAt.toISOString(),
  };
}
