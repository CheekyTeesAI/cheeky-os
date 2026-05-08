import type { Order } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { syncPrintTaskBlocksForOrder } from "./productionPrintGateService";

export const PROOF_STATUS = {
  NOT_SENT: "NOT_SENT",
  SENT: "SENT",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export function sendProof(order: Order): void {
  const num = order.orderNumber ?? order.id.slice(0, 8);
  const subject = `Proof Approval - Order #${num}`;
  const summary = [
    order.garmentType && `Garment: ${order.garmentType}`,
    order.quantity != null && `Qty: ${order.quantity}`,
    order.printMethod && `Method: ${order.printMethod}`,
    order.notes && `Notes: ${order.notes}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const body = [
    `Customer: ${order.customerName ?? "—"}`,
    `Summary: ${summary || "—"}`,
    "",
    "Please review the proof and reply to approve, or let us know if you need changes.",
  ].join("\n");
  logger.info(`[sendProof] ${subject}\n${body}`);
}

export async function ensureProofApprovalTask(
  orderId: string
): Promise<{ ok: boolean; created?: boolean; skipped?: boolean }> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      tasks: { select: { type: true } },
    },
  });
  if (!order) return { ok: false };
  const o = order as typeof order & {
    proofRequired?: boolean | null;
    proofStatus?: string | null;
  };
  if (o.proofRequired !== true) return { ok: true, skipped: true };
  const st = String(o.proofStatus ?? "").toUpperCase();
  if (st === PROOF_STATUS.APPROVED) return { ok: true, skipped: true };

  const has = order.tasks.some((t) => t.type === "PROOF_APPROVAL");
  if (has) return { ok: true, skipped: true };

  const job = await db.job.findUnique({ where: { orderId } });
  if (!job) return { ok: true, skipped: true };
  const label = order.orderNumber ?? orderId.slice(0, 8);

  await db.task.create({
    data: {
      orderId,
      jobId: job.id,
      title: `Send proof for Order #${label}`,
      type: "PROOF_APPROVAL",
      status: "PENDING",
    },
  });
  return { ok: true, created: true };
}

export async function sendProofForOrder(orderId: string): Promise<{
  success: true;
  orderId: string;
}> {
  const order = await db.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw new Error("Order not found");

  const now = new Date();
  await db.order.update({
    where: { id: orderId },
    data: {
      proofStatus: PROOF_STATUS.SENT,
      proofSentAt: now,
    } as any,
  });
  logger.info(`[proof] send orderId=${orderId} proofStatus=${PROOF_STATUS.SENT}`);
  const fresh = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  sendProof(fresh);
  await syncPrintTaskBlocksForOrder(orderId);
  return { success: true, orderId };
}

export async function approveProof(orderId: string): Promise<{ success: true }> {
  const n = await db.order.updateMany({
    where: { id: orderId, deletedAt: null },
    data: {
      proofStatus: PROOF_STATUS.APPROVED,
      proofApprovedAt: new Date(),
    } as any,
  });
  if (n.count === 0) throw new Error("Order not found");
  await syncPrintTaskBlocksForOrder(orderId);
  return { success: true };
}

export async function rejectProof(orderId: string): Promise<{ success: true }> {
  const n = await db.order.updateMany({
    where: { id: orderId, deletedAt: null },
    data: { proofStatus: PROOF_STATUS.REJECTED } as any,
  });
  if (n.count === 0) throw new Error("Order not found");
  await syncPrintTaskBlocksForOrder(orderId);
  return { success: true };
}

export async function listOrdersProofQueue(): Promise<
  Array<{
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    proofStatus: string;
    proofRequired: boolean;
    status: string;
    garmentType: string | null;
    proofSentAt: Date | null;
  }>
> {
  const rows = await db.order.findMany({
    where: {
      deletedAt: null,
      proofRequired: true,
      proofStatus: {
        in: [PROOF_STATUS.NOT_SENT, PROOF_STATUS.SENT, PROOF_STATUS.REJECTED],
      },
    } as any,
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      proofStatus: true,
      proofRequired: true,
      status: true,
      garmentType: true,
      proofSentAt: true,
    } as any,
    take: 50,
    orderBy: { updatedAt: "desc" },
  });
  return rows as unknown as Array<{
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    proofStatus: string;
    proofRequired: boolean;
    status: string;
    garmentType: string | null;
    proofSentAt: Date | null;
  }>;
}
