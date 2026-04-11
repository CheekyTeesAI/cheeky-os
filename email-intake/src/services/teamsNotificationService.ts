import { db } from "../db/client";
import { sendTeamsWebhookMessage } from "../lib/teamsClient";

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return String(n);
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return String(n);
}

type NotifyResult = { success: true } | { success: false; error: string };

function wrapTeamsCall(fn: () => Promise<void>): Promise<NotifyResult> {
  return fn()
    .then(() => ({ success: true as const }))
    .catch((e) => ({
      success: false as const,
      error: e instanceof Error ? e.message : String(e),
    }));
}

export async function notifyNewIntake(orderId: string): Promise<NotifyResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` };
  }
  const text = [
    "📥 New Intake",
    `Customer: ${order.customerName}`,
    `Email: ${order.email}`,
    `Order ID: ${order.id}`,
    `Status: ${order.status}`,
  ].join("\n");
  return wrapTeamsCall(() => sendTeamsWebhookMessage(text));
}

export async function notifyBlockedOrder(orderId: string): Promise<NotifyResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` };
  }
  const text = [
    "⛔ Order Blocked",
    `Customer: ${order.customerName}`,
    `Order ID: ${order.id}`,
    `Reason: ${order.blockedReason ?? "—"}`,
    `Quoted Amount: ${fmtMoney(order.quotedAmount)}`,
    `Margin: ${fmtNum(order.margin)}`,
    `PPH: ${fmtNum(order.pph)}`,
  ].join("\n");
  return wrapTeamsCall(() => sendTeamsWebhookMessage(text));
}

export async function notifyQuoteSent(orderId: string): Promise<NotifyResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` };
  }
  const text = [
    "📧 Quote / invoice sent",
    `Customer: ${order.customerName}`,
    `Order ID: ${order.id}`,
    `Square invoice: ${order.squareInvoiceNumber ?? order.squareInvoiceId ?? "—"}`,
    `Status: ${order.status}`,
  ].join("\n");
  return wrapTeamsCall(() => sendTeamsWebhookMessage(text));
}

export async function notifyDepositReceived(
  orderId: string
): Promise<NotifyResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` };
  }
  const text = [
    "💰 Deposit Received",
    `Customer: ${order.customerName}`,
    `Order ID: ${order.id}`,
    `Deposit Required: ${fmtMoney(order.depositRequired)}`,
    `Amount Paid: ${fmtMoney(order.amountPaid)}`,
    `Status: ${order.status}`,
  ].join("\n");
  return wrapTeamsCall(() => sendTeamsWebhookMessage(text));
}

export async function notifyProductionReady(
  orderId: string
): Promise<NotifyResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` };
  }
  const productionType = order.printMethod ?? "—";
  const text = [
    "🏭 Production Ready",
    `Customer: ${order.customerName}`,
    `Order ID: ${order.id}`,
    `Production Type: ${productionType}`,
    `Status: ${order.status}`,
  ].join("\n");
  return wrapTeamsCall(() => sendTeamsWebhookMessage(text));
}
