import { OrderDepositStatus, type Order } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { sendEmail } from "./email.service";
import { sendProofForOrder } from "./proofRoutingService";

export const COMM_TYPES = {
  DEPOSIT_REMINDER: "DEPOSIT_REMINDER",
  PROOF_REQUEST: "PROOF_REQUEST",
  PROOF_APPROVED: "PROOF_APPROVED",
  PROOF_REJECTED: "PROOF_REJECTED",
  STATUS_UPDATE: "STATUS_UPDATE",
  PICKUP_READY: "PICKUP_READY",
  ART_SENT_TO_DIGITIZER: "ART_SENT_TO_DIGITIZER",
  FILE_LINKED: "FILE_LINKED",
} as const;

const LOG_STATUS = {
  SENT: "SENT",
  FAILED: "FAILED",
  STUBBED: "STUBBED",
} as const;

export type DeliveryOutcome = { mode: "real" | "stub" | "failed"; error?: string };

export async function deliverCustomerEmail(
  to: string | null | undefined,
  subject: string,
  body: string
): Promise<DeliveryOutcome> {
  const addr = String(to ?? "").trim();
  const host = (process.env.SMTP_HOST || "").trim();
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    logger.info(`[customerComms] no valid email — stub subject=${subject}`);
    return { mode: "stub" };
  }
  if (!host) {
    try {
      await sendEmail(addr, subject, body);
    } catch {
      /* sendEmail handles no-host */
    }
    return { mode: "stub" };
  }
  try {
    await sendEmail(addr, subject, body);
    return { mode: "real" };
  } catch (e) {
    return {
      mode: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function logStatusForDelivery(d: DeliveryOutcome): string {
  if (d.mode === "real") return LOG_STATUS.SENT;
  if (d.mode === "failed") return LOG_STATUS.FAILED;
  return LOG_STATUS.STUBBED;
}

export async function logCommunication(entry: {
  orderId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  type: string;
  subject: string;
  message: string;
  status: string;
}): Promise<{ id: string }> {
  const row = await (db as any).customerCommunication.create({
    data: {
      orderId: entry.orderId,
      customerName: entry.customerName ?? null,
      customerEmail: entry.customerEmail ?? null,
      type: entry.type,
      subject: entry.subject,
      message: entry.message,
      status: entry.status,
    },
  });
  return { id: row.id };
}

export function buildStatusMessage(order: Order & { proofStatus?: string; proofRequired?: boolean }): string {
  const st = String(order.status);
  const proof = String(order.proofStatus ?? "").toUpperCase();
  const dep = order.depositStatus;
  const garment = String(order.garmentOrderStatus ?? "").toUpperCase();

  if (dep !== OrderDepositStatus.PAID && !order.depositReceived) {
    const req = Number(order.depositRequired ?? 0);
    const paid = Number(order.amountPaid ?? 0);
    return `Awaiting deposit: $${paid.toFixed(2)} paid of $${req.toFixed(2)} required.`;
  }
  if (order.proofRequired === true) {
    if (proof !== "APPROVED" && proof !== "REJECTED") {
      return proof === "SENT"
        ? "Proof sent — please review and approve so we can continue."
        : "Proof pending — we will send a mockup for your approval shortly.";
    }
  }
  if (garment && garment !== "RECEIVED" && garment !== "NOT_NEEDED") {
    return "Garments are being ordered or are on the way.";
  }
  if (st === "PRINTING" || st === "IN_PRODUCTION" || st === "PRODUCTION") {
    return "Your order is in production.";
  }
  if (st === "QC") {
    return "Your order is in quality check.";
  }
  if (st === "READY" || st === "COMPLETED") {
    return "Your order is ready for pickup (or completed).";
  }
  return `Order status: ${st}. We will keep you updated.`;
}

export async function getOrdersNeedingDepositReminder(): Promise<Order[]> {
  return db.order.findMany({
    where: {
      deletedAt: null,
      depositStatus: { not: OrderDepositStatus.PAID },
      status: { in: ["QUOTE_SENT", "AWAITING_DEPOSIT"] },
    } as any,
    orderBy: { updatedAt: "asc" },
    take: 75,
  });
}

export async function sendDepositReminder(orderId: string): Promise<{
  success: true;
  orderId: string;
  logId: string;
  deliveryMode: "real" | "stub" | "failed";
  action: string;
}> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
  });
  if (!order) throw new Error("Order not found");
  if (order.depositStatus === OrderDepositStatus.PAID || order.depositReceived === true) {
    throw new Error("Deposit already paid — reminder not needed");
  }

  const required = Number(order.depositRequired ?? 0);
  const paid = Number(order.depositPaid ?? order.amountPaid ?? 0);
  const remaining = Math.max(0, required - paid);
  const name = order.customerName ?? "there";
  const subject = `Deposit reminder — Order #${order.orderNumber ?? order.id.slice(0, 8)}`;
  const message = [
    `Hi ${name},`,
    "",
    `This is a friendly reminder about your order.`,
    `Deposit required: $${required.toFixed(2)}`,
    `Amount paid toward deposit: $${paid.toFixed(2)}`,
    `Remaining: $${remaining.toFixed(2)}`,
    "",
    "Reply to this email or contact us when you are ready to proceed.",
    "",
    "— Cheeky Tees",
  ].join("\n");

  const d = await deliverCustomerEmail(order.email, subject, message);
  const status = logStatusForDelivery(d);
  const { id: logId } = await logCommunication({
    orderId,
    customerName: order.customerName,
    customerEmail: order.email,
    type: COMM_TYPES.DEPOSIT_REMINDER,
    subject,
    message,
    status,
  });

  return {
    success: true,
    orderId,
    logId,
    deliveryMode: d.mode === "failed" ? "failed" : d.mode,
    action: "deposit_reminder_sent",
  };
}

export async function sendProofRequestComm(orderId: string): Promise<{
  success: true;
  orderId: string;
  logId: string;
  deliveryMode: "real" | "stub" | "failed";
  action: string;
}> {
  await sendProofForOrder(orderId);
  const order = await db.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw new Error("Order not found");

  const num = order.orderNumber ?? order.id.slice(0, 8);
  const subject = `Proof Approval — Order #${num}`;
  const message = [
    `Hi ${order.customerName ?? "there"},`,
    "",
    "Please review your proof and reply to approve, or tell us what to adjust.",
    "Staff may also mark approval in our system when you confirm by phone.",
    "",
    "— Cheeky Tees",
  ].join("\n");

  const { id: logId } = await logCommunication({
    orderId,
    customerName: order.customerName,
    customerEmail: order.email,
    type: COMM_TYPES.PROOF_REQUEST,
    subject,
    message,
    status: LOG_STATUS.STUBBED,
  });

  return {
    success: true,
    orderId,
    logId,
    deliveryMode: "stub",
    action: "proof_request_sent",
  };
}

export async function sendStatusUpdate(
  orderId: string,
  customMessage?: string
): Promise<{
  success: true;
  orderId: string;
  logId: string;
  deliveryMode: "real" | "stub" | "failed";
  action: string;
}> {
  const order = await db.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw new Error("Order not found");

  const body = (customMessage && customMessage.trim()) || buildStatusMessage(order);
  const subject = `Order update — #${order.orderNumber ?? order.id.slice(0, 8)}`;
  const message = [`Hi ${order.customerName ?? "there"},`, "", body, "", "— Cheeky Tees"].join(
    "\n"
  );

  const d = await deliverCustomerEmail(order.email, subject, message);
  const status = logStatusForDelivery(d);
  const { id: logId } = await logCommunication({
    orderId,
    customerName: order.customerName,
    customerEmail: order.email,
    type: COMM_TYPES.STATUS_UPDATE,
    subject,
    message,
    status,
  });

  return {
    success: true,
    orderId,
    logId,
    deliveryMode: d.mode === "failed" ? "failed" : d.mode,
    action: "status_update_sent",
  };
}

export async function sendPickupReady(orderId: string): Promise<{
  success: true;
  orderId: string;
  logId: string;
  deliveryMode: "real" | "stub" | "failed";
  action: string;
}> {
  const order = await db.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw new Error("Order not found");

  const subject = `Ready for pickup — Order #${order.orderNumber ?? order.id.slice(0, 8)}`;
  const message = [
    `Hi ${order.customerName ?? "there"},`,
    "",
    "Your order is ready for pickup. Please contact us to arrange collection.",
    "",
    "— Cheeky Tees",
  ].join("\n");

  const d = await deliverCustomerEmail(order.email, subject, message);
  const status = logStatusForDelivery(d);

  await db.order.update({
    where: { id: orderId },
    data: { pickupNotifiedAt: new Date() } as any,
  });

  const { id: logId } = await logCommunication({
    orderId,
    customerName: order.customerName,
    customerEmail: order.email,
    type: COMM_TYPES.PICKUP_READY,
    subject,
    message,
    status,
  });

  return {
    success: true,
    orderId,
    logId,
    deliveryMode: d.mode === "failed" ? "failed" : d.mode,
    action: "pickup_ready_sent",
  };
}

export async function listRecentCommunications(
  take = 50
): Promise<
  Array<{
    id: string;
    orderId: string;
    type: string;
    subject: string;
    status: string;
    createdAt: Date;
    customerName: string | null;
  }>
> {
  const rows = await (db as any).customerCommunication.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      orderId: true,
      type: true,
      subject: true,
      status: true,
      createdAt: true,
      customerName: true,
    },
  });
  return rows;
}

export async function getOrdersReadyForPickup(): Promise<Order[]> {
  return db.order.findMany({
    where: {
      deletedAt: null,
      pickupNotifiedAt: null,
      status: { in: ["QC", "READY"] },
    } as any,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export async function attachOrderFileLinks(
  orderId: string,
  links: { mockupUrl?: string; artFileUrl?: string; proofFileUrl?: string }
): Promise<{
  id: string;
  mockupUrl: string | null;
  artFileUrl: string | null;
  proofFileUrl: string | null;
}> {
  const exists = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) throw new Error("Order not found");

  const data: Record<string, string | null | undefined> = {};
  if (links.mockupUrl !== undefined) data.mockupUrl = links.mockupUrl || null;
  if (links.artFileUrl !== undefined) data.artFileUrl = links.artFileUrl || null;
  if (links.proofFileUrl !== undefined) data.proofFileUrl = links.proofFileUrl || null;

  const updated = await db.order.update({
    where: { id: orderId },
    data: data as any,
    select: {
      id: true,
      mockupUrl: true,
      artFileUrl: true,
      proofFileUrl: true,
    } as any,
  });

  const ord = await db.order.findFirst({
    where: { id: orderId },
    select: { customerName: true, email: true },
  });

  const summary = JSON.stringify(
    {
      mockupUrl: updated.mockupUrl,
      artFileUrl: updated.artFileUrl,
      proofFileUrl: updated.proofFileUrl,
    },
    null,
    0
  );

  await logCommunication({
    orderId,
    customerName: ord?.customerName,
    customerEmail: ord?.email,
    type: COMM_TYPES.FILE_LINKED,
    subject: "File links updated",
    message: summary,
    status: LOG_STATUS.STUBBED,
  });

  return updated as any;
}

export async function getCustomerCommsDigest(): Promise<{
  counts: Record<string, number>;
  summaryLine: string;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    depositQueue,
    proofNotSent,
    proofAwaiting,
    pickupQueue,
    recentStubbed,
  ] = await Promise.all([
    getOrdersNeedingDepositReminder(),
    db.order.count({
      where: {
        deletedAt: null,
        proofRequired: true,
        proofStatus: "NOT_SENT",
      } as any,
    }),
    db.order.count({
      where: {
        deletedAt: null,
        proofRequired: true,
        proofStatus: "SENT",
      } as any,
    }),
    getOrdersReadyForPickup(),
    (db as any).customerCommunication.count({
      where: {
        status: "STUBBED",
        createdAt: { gte: since },
      },
    }),
  ]);

  const pickupNotNotified = pickupQueue.length;

  const counts = {
    unpaidOrdersNeedingReminders: depositQueue.length,
    proofsNotSent: proofNotSent,
    proofsAwaitingApproval: proofAwaiting,
    pickupReadyNotNotified: pickupNotNotified,
    commsStubbedLast24h: recentStubbed,
  };

  const parts: string[] = [];
  if (counts.unpaidOrdersNeedingReminders > 0) {
    parts.push(`${counts.unpaidOrdersNeedingReminders} unpaid (deposit reminder candidates)`);
  }
  if (counts.proofsNotSent > 0) parts.push(`${counts.proofsNotSent} proofs not sent`);
  if (counts.proofsAwaitingApproval > 0) {
    parts.push(`${counts.proofsAwaitingApproval} proofs awaiting customer`);
  }
  if (counts.pickupReadyNotNotified > 0) {
    parts.push(`${counts.pickupReadyNotNotified} pickup-ready (not notified)`);
  }
  if (counts.commsStubbedLast24h > 0) {
    parts.push(`${counts.commsStubbedLast24h} comms stubbed (24h)`);
  }

  return {
    counts,
    summaryLine: parts.length ? parts.join(" · ") : "Comms loop clear — no outstanding digest items.",
  };
}
