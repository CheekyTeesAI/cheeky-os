import type { Order, LineItem } from "@prisma/client";

/** Operational garment lifecycle (string column; vendor paths may use SUBMITTED/DRAFT). */
export const GarmentOrderStatus = {
  NOT_NEEDED: "NOT_NEEDED",
  NEEDED: "NEEDED",
  ORDER_PENDING: "ORDER_PENDING",
  ORDERED: "ORDERED",
  RECEIVED: "RECEIVED",
} as const;

export const WorkOrderStatus = {
  NOT_CREATED: "NOT_CREATED",
  READY: "READY",
  COMPLETED: "COMPLETED",
} as const;

export const ArtFileStatus = {
  NOT_READY: "NOT_READY",
  READY: "READY",
  APPROVED: "APPROVED",
} as const;

type OrderWithLines = Order & { lineItems?: LineItem[] };

/**
 * True when physical blanks must be ordered before production.
 * Safe default: assume garments are needed unless explicitly not.
 */
export function determineGarmentOrderingNeeded(order: OrderWithLines): boolean {
  const cur = String(order.garmentOrderStatus ?? "").toUpperCase();
  if (cur === GarmentOrderStatus.NOT_NEEDED) return false;

  const lines = order.lineItems ?? [];
  if (lines.length > 0) {
    const qty = lines.reduce((s, li) => s + (Number(li.quantity) || 0), 0);
    if (qty > 0) return true;
  }

  const q = Number(order.quantity) || 0;
  if (q > 0) return true;

  const gt = String(order.garmentType ?? "").trim();
  if (gt.length > 0) return true;

  return true;
}

export function buildPostDepositGarmentFields(order: OrderWithLines): {
  garmentOrderNeeded: boolean;
  garmentOrderStatus: string;
  workOrderStatus: string;
  artFileStatus: string;
} {
  const needed = determineGarmentOrderingNeeded(order);
  return {
    garmentOrderNeeded: needed,
    garmentOrderStatus: needed
      ? GarmentOrderStatus.ORDER_PENDING
      : GarmentOrderStatus.NOT_NEEDED,
    workOrderStatus: WorkOrderStatus.NOT_CREATED,
    artFileStatus: ArtFileStatus.NOT_READY,
  };
}
