import { db } from "../db/client";

/** Inline art gate (avoids circular imports with artRoutingService). */
function isArtReadyForPrinting(order: { artFileStatus?: string | null }): boolean {
  const s = String(order.artFileStatus ?? "").toUpperCase();
  return s === "READY" || s === "APPROVED";
}

export type OrderProofGateShape = {
  artFileStatus?: string | null;
  proofRequired?: boolean | null;
  proofStatus?: string | null;
  lineItems?: Array<{ description?: string | null; productionType?: string | null }>;
};

/**
 * When true, print-method tasks should stay BLOCKED until gates clear.
 */
export function shouldBlockPrintTasksForOrder(order: OrderProofGateShape): boolean {
  if (!isArtReadyForPrinting(order)) return true;
  if (order.proofRequired === true) {
    const p = String(order.proofStatus ?? "").toUpperCase();
    if (p !== "APPROVED") return true;
  }
  return false;
}

function printTaskWhere(orderId: string, blocked: boolean) {
  const orClause = [
    { title: { startsWith: "Print " } },
    { title: "Burn Screen" },
    { title: { startsWith: "Press " } },
  ];
  if (blocked) {
    return {
      orderId,
      status: { not: "DONE" },
      OR: orClause,
    };
  }
  return {
    orderId,
    status: "BLOCKED",
    OR: orClause,
  };
}

/**
 * Reconcile print-step task BLOCKED state vs art + proof gates.
 */
export async function syncPrintTaskBlocksForOrder(orderId: string): Promise<void> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: { lineItems: { select: { description: true, productionType: true } } },
  });
  if (!order) return;
  const block = shouldBlockPrintTasksForOrder(order);
  if (block) {
    await db.task.updateMany({
      where: printTaskWhere(orderId, true) as any,
      data: { status: "BLOCKED" },
    });
  } else {
    await db.task.updateMany({
      where: printTaskWhere(orderId, false) as any,
      data: { status: "PENDING" },
    });
  }
}
