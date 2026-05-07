import { OrderDepositStatus } from "@prisma/client";
import { db } from "../db/client";
import { normalizeSquarePaymentStatus } from "../lib/paymentStateNormalizer";
import {
  buildPaymentCompletedMoneySyncView,
  compactSyncLogLine,
} from "../lib/squareOrderStateSync";
import { generateTasksForOrder } from "./taskGenerator";
import { PROOF_STATUS } from "./proofRoutingService";

type HandleResult = {
  ok: true;
  duplicate?: boolean;
  skipped?: boolean;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPayment(payload: any): any {
  return payload?.data?.object?.payment ?? payload?.payment ?? null;
}

function readEventType(payload: any): string | null {
  return (
    asString(payload?.type) ??
    asString(payload?.event_type) ??
    asString(payload?.eventType)
  );
}

function amountToDollars(cents: unknown): number {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return 0;
  return cents / 100;
}

export async function handleSquarePaymentWebhook(payload: any): Promise<HandleResult> {
  const eventType = readEventType(payload);
  if (eventType !== "payment.completed") {
    return { ok: true, skipped: true };
  }

  const payment = readPayment(payload);
  const payRaw =
    typeof payment?.status === "string" ? payment.status.trim() : "";
  const normPay = normalizeSquarePaymentStatus(payRaw || null);
  if (payRaw && normPay === "UNKNOWN") {
    console.warn(
      `[square-payment] payment_status_normalized_unknown raw=${payRaw.slice(0, 80)}`
    );
  }

  const squarePaymentId = asString(payment?.id);
  if (!squarePaymentId) {
    console.error("[squarePaymentHandler] payment.completed missing payment.id");
    return { ok: true, skipped: true };
  }

  const squareOrderId = asString(payment?.order_id);
  const email = asString(payment?.buyer_email_address);
  if (!email) {
    console.error("[squarePaymentHandler] payment.completed missing buyer email");
    return { ok: true, skipped: true };
  }

  const existingOrder = await db.order.findUnique({
    where: { squareId: squarePaymentId },
    select: { id: true },
  });
  if (existingOrder) {
    return { ok: true, duplicate: true };
  }

  const name = asString(payment?.buyer_name) ?? asString(payload?.customer?.name) ?? "Square Customer";
  const totalAmount = amountToDollars(payment?.amount_money?.amount);

  const moneySync = buildPaymentCompletedMoneySyncView({
    payload,
    eventType,
    rawPaymentStatus: payRaw || null,
    normPay,
    squarePaymentId,
    squareOrderId,
    totalAmountDollars: totalAmount,
  });
  console.log(`[square-payment] phase=money_sync ${compactSyncLogLine(moneySync)}`);

  const customer = await db.customer.upsert({
    where: { email },
    update: { name },
    create: { email, name },
    select: { id: true },
  });

  const orderData: Record<string, unknown> = {
    orderNumber: `CHK-${Date.now()}`,
    customerId: customer.id,
    squareId: squarePaymentId,
    squareOrderId,
    totalAmount,
    depositAmount: totalAmount,
    depositPaid: totalAmount,
    depositStatus: OrderDepositStatus.PAID,
    amountPaid: totalAmount,
    depositReceived: true,
    status: "PRODUCTION_READY",
    source: "SQUARE",
    proofRequired: true,
    proofStatus: PROOF_STATUS.NOT_SENT,
  };

  try {
    const createdOrder = await db.order.create({
      data: orderData as any,
    });
    await generateTasksForOrder(createdOrder.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unknown argument `source`")) {
      const { source: _source, ...withoutSource } = orderData;
      const createdOrder = await db.order.create({
        data: withoutSource as any,
      });
      await generateTasksForOrder(createdOrder.id);
    } else {
      throw error;
    }
  }

  return { ok: true };
}
