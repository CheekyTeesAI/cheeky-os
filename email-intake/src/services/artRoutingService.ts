import type { Order } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { syncPrintTaskBlocksForOrder } from "./productionPrintGateService";

/**
 * Art lifecycle for production gating — stored on `Order.artFileStatus`
 * (same values as mission `artStatus`; no extra column).
 */
export const ART_STATUS = {
  NOT_READY: "NOT_READY",
  SENT_TO_DIGITIZER: "SENT_TO_DIGITIZER",
  READY: "READY",
  APPROVED: "APPROVED",
} as const;

export type ArtOrderShape = {
  artFileStatus?: string | null;
  notes?: string | null;
  lineItems?: Array<{ description?: string | null; productionType?: string | null }>;
};

/** Coarse “has artwork reference” — line description/productionType or notes; no file inspection. */
export function orderHasGraphicSignal(order: ArtOrderShape): boolean {
  const lines = order.lineItems ?? [];
  if (
    lines.some((li) => {
      const d = String(li.description ?? "").trim();
      const p = String(li.productionType ?? "").trim();
      return d.length > 0 || p.length > 0;
    })
  ) {
    return true;
  }
  const n = String(order.notes ?? "");
  if (/\b(https?:\/\/[^\s]+|\.(png|jpg|jpeg|svg|pdf))\b/i.test(n)) {
    return true;
  }
  if (/\b(logo|graphic|artwork)\b/i.test(n)) return true;
  return false;
}

/**
 * Art is ready for production when ops have marked READY/APPROVED.
 * (Graphic heuristics are advisory; approval is authoritative.)
 */
export function isArtReady(order: ArtOrderShape): boolean {
  const s = String(order.artFileStatus ?? "").toUpperCase();
  const marked = s === ART_STATUS.READY || s === ART_STATUS.APPROVED;
  if (!marked) return false;
  return marked && (orderHasGraphicSignal(order) || marked);
}

/**
 * When art is not READY/APPROVED, ensure a single ART_PREP task exists (after job/deposit).
 */
export async function ensureArtPrepTask(
  orderId: string
): Promise<{ ok: boolean; created?: boolean; skipped?: boolean }> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      tasks: { select: { type: true } },
      lineItems: { select: { description: true, productionType: true } },
    },
  });
  if (!order) return { ok: false };
  if (isArtReady(order)) return { ok: true, skipped: true };

  const hasPrep = order.tasks.some((t) => t.type === "ART_PREP");
  if (hasPrep) return { ok: true, skipped: true };

  const job = await db.job.findUnique({ where: { orderId } });
  if (!job) return { ok: true, skipped: true };
  const label = order.orderNumber ?? orderId.slice(0, 8);

  await db.task.create({
    data: {
      orderId,
      jobId: job.id,
      title: `Prepare artwork for Order #${label}`,
      type: "ART_PREP",
      /** Queued for staff — mission “READY” ≈ open in queue */
      status: "PENDING",
    },
  });
  return { ok: true, created: true };
}

export function sendToPeter(order: Order): void {
  const num = order.orderNumber ?? order.id.slice(0, 8);
  const subject = `Art Request - Order #${num}`;
  const body = [
    `Customer: ${order.customerName ?? "—"}`,
    `Item: ${order.garmentType ?? order.printMethod ?? "—"}`,
    `Notes: ${order.notes ?? "—"}`,
    "",
    "Request: PNG, transparent background",
  ].join("\n");
  logger.info(`[sendToPeter] ${subject}\n${body}`);
}

export async function sendOrderToDigitizer(orderId: string): Promise<{
  success: true;
  orderId: string;
}> {
  const order = await db.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) {
    throw new Error("Order not found");
  }
  await db.order.update({
    where: { id: orderId },
    data: { artFileStatus: ART_STATUS.SENT_TO_DIGITIZER } as any,
  });
  const fresh = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  logger.info(
    `[art] send_to_digitizer orderId=${orderId} artFileStatus=${ART_STATUS.SENT_TO_DIGITIZER}`
  );
  sendToPeter(fresh);
  return { success: true, orderId };
}

export async function markArtReady(orderId: string): Promise<{ success: true }> {
  const n = await db.order.updateMany({
    where: { id: orderId, deletedAt: null },
    data: { artFileStatus: ART_STATUS.READY } as any,
  });
  if (n.count === 0) {
    throw new Error("Order not found");
  }
  await syncPrintTaskBlocksForOrder(orderId);
  return { success: true };
}

export async function listOrdersNeedingArt(): Promise<
  Array<{
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    artFileStatus: string | null;
    status: string;
    garmentType: string | null;
  }>
> {
  const rows = await db.order.findMany({
    where: {
      deletedAt: null,
      OR: [
        {
          artFileStatus: {
            in: [ART_STATUS.NOT_READY, ART_STATUS.SENT_TO_DIGITIZER],
          },
        },
        { artFileStatus: null },
      ],
    } as any,
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      artFileStatus: true,
      status: true,
      garmentType: true,
    } as any,
    take: 50,
    orderBy: { updatedAt: "desc" },
  });
  return rows as unknown as Array<{
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    artFileStatus: string | null;
    status: string;
    garmentType: string | null;
  }>;
}
