import type { LineItem, Task } from "@prisma/client";
import { OrderDepositStatus } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";

export const WORK_ORDER_STATUS = {
  NOT_CREATED: "NOT_CREATED",
  GENERATED: "GENERATED",
  PRINTED: "PRINTED",
} as const;

export type WorkOrderPacket = {
  orderId: string;
  workOrderNumber: string | null;
  workOrderStatus: string;
  customerName: string | null;
  customerEmail: string | null;
  stage: string;
  productionType: string | null;
  dueDate: string | null;
  depositStatus: string;
  proofStatus: string | null;
  artStatus: string | null;
  garmentOrderStatus: string | null;
  lineItems: Array<{
    name: string;
    quantity: number;
    notes: string | null;
    color: string | null;
    sizes: string | null;
    printLocations: string | null;
  }>;
  productionNotes: string | null;
  artFileUrl: string | null;
  mockupUrl: string | null;
  proofFileUrl: string | null;
  taskSummary: Array<{ title: string; status: string; type: string | null }>;
  blockers: string[];
};

const orderInclude = {
  lineItems: true,
  tasks: { orderBy: { createdAt: "asc" as const } },
} as const;

/** Gate evaluation uses scalar fields only (avoids stale Prisma client edge cases). */
export type OrderGateInput = {
  deletedAt?: Date | null;
  status?: string;
  depositStatus?: OrderDepositStatus;
  proofRequired?: boolean | null;
  proofStatus?: string | null;
  artFileStatus?: string | null;
  garmentOrderNeeded?: boolean | null;
  garmentOrderStatus?: string | null;
};

export type OrderForWorkOrder = OrderGateInput & {
  id: string;
  orderNumber?: string | null;
  customerName?: string | null;
  email?: string | null;
  notes?: string | null;
  quantity?: number | null;
  garmentType?: string | null;
  printMethod?: string | null;
  productionTypeFinal?: string | null;
  dueDate?: Date | null;
  workOrderStatus?: string | null;
  workOrderNumber?: string | null;
  workOrderGeneratedAt?: Date | null;
  mockupUrl?: string | null;
  artFileUrl?: string | null;
  proofFileUrl?: string | null;
  lineItems: LineItem[];
  tasks: Task[];
};

function normWoStatus(s: string | null | undefined): string {
  const u = String(s || "").toUpperCase();
  if (u === "GENERATED" || u === "PRINTED") return u;
  return WORK_ORDER_STATUS.NOT_CREATED;
}

/**
 * Gates align with productionPrintGate + garment comms heuristics.
 */
export function isWorkOrderReady(order: OrderGateInput): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  if (order.deletedAt) {
    blockers.push("Order deleted");
  }
  if (order.status === "CANCELLED") {
    blockers.push("Order cancelled");
  }

  if (order.depositStatus !== OrderDepositStatus.PAID) {
    blockers.push("Deposit not paid");
  }

  if (order.proofRequired === true) {
    const p = String(order.proofStatus ?? "").toUpperCase();
    if (p !== "APPROVED") {
      blockers.push("Proof not approved");
    }
  }

  const art = String(order.artFileStatus ?? "").toUpperCase();
  if (art !== "READY" && art !== "APPROVED") {
    blockers.push("Art not ready");
  }

  if (order.garmentOrderNeeded === true) {
    const g = String(order.garmentOrderStatus ?? "").toUpperCase();
    if (g !== "NOT_NEEDED" && g !== "RECEIVED") {
      blockers.push("Garments not received");
    }
  }

  return { ready: blockers.length === 0, blockers };
}

function defaultWorkOrderNumber(order: Pick<OrderForWorkOrder, "id" | "orderNumber">): string {
  const base = order.orderNumber?.trim() || order.id.slice(0, 8).toUpperCase();
  return `WO-${base}`;
}

export function buildWorkOrderPacket(order: OrderForWorkOrder): WorkOrderPacket {
  const { ready, blockers } = isWorkOrderReady(order);
  void ready;

  const lineItems = (order.lineItems ?? []).map((li) => ({
    name: li.description || "Line item",
    quantity: li.quantity,
    notes: li.productionType || null,
    color: null,
    sizes: null,
    printLocations: li.productionType || null,
  }));

  if (lineItems.length === 0 && order.quantity != null && order.quantity > 0) {
    lineItems.push({
      name: order.garmentType || "Order total",
      quantity: order.quantity,
      notes: order.printMethod || null,
      color: null,
      sizes: null,
      printLocations: order.printMethod || null,
    });
  }

  const taskSummary = (order.tasks ?? []).map((t) => ({
    title: t.title,
    status: String(t.status),
    type: t.type ?? null,
  }));

  return {
    orderId: order.id,
    workOrderNumber: order.workOrderNumber ?? null,
    workOrderStatus: normWoStatus(order.workOrderStatus),
    customerName: order.customerName ?? null,
    customerEmail: order.email ?? null,
    stage: String(order.status),
    productionType:
      order.productionTypeFinal ||
      (order.lineItems?.[0]?.productionType != null
        ? String(order.lineItems[0].productionType)
        : null),
    dueDate: order.dueDate ? order.dueDate.toISOString() : null,
    depositStatus: String(order.depositStatus),
    proofStatus: order.proofStatus ?? null,
    artStatus: order.artFileStatus ?? null,
    garmentOrderStatus: order.garmentOrderStatus ?? null,
    lineItems,
    productionNotes: order.notes ?? null,
    artFileUrl: order.artFileUrl ?? null,
    mockupUrl: order.mockupUrl ?? null,
    proofFileUrl: order.proofFileUrl ?? null,
    taskSummary,
    blockers,
  };
}

export async function loadOrderForWorkOrder(
  orderId: string
): Promise<OrderForWorkOrder | null> {
  return db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: orderInclude,
  });
}

export async function generateWorkOrder(orderId: string): Promise<
  | { ok: true; packet: WorkOrderPacket; workOrderNumber: string }
  | { ok: false; blockers: string[] }
> {
  const order = await loadOrderForWorkOrder(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const gate = isWorkOrderReady(order);
  if (!gate.ready) {
    return { ok: false, blockers: gate.blockers };
  }

  const num = order.workOrderNumber?.trim() || defaultWorkOrderNumber(order);
  const updated = await db.order.update({
    where: { id: orderId },
    data: {
      workOrderStatus: WORK_ORDER_STATUS.GENERATED,
      workOrderGeneratedAt: new Date(),
      workOrderNumber: num,
    },
    include: orderInclude,
  });

  const packet = buildWorkOrderPacket(updated as OrderForWorkOrder);
  packet.workOrderNumber = num;
  packet.workOrderStatus = WORK_ORDER_STATUS.GENERATED;

  logger.info(`[workOrder] generated ${num} for order ${orderId}`);
  return { ok: true, packet, workOrderNumber: num };
}

export async function markWorkOrderPrinted(orderId: string): Promise<void> {
  await db.order.update({
    where: { id: orderId },
    data: { workOrderStatus: WORK_ORDER_STATUS.PRINTED },
  });
}

export type ReadyRow = {
  orderId: string;
  customerName: string | null;
  ready: boolean;
  workOrderStatus: string;
  workOrderNumber: string | null;
  blockers: string[];
};

export async function listWorkOrdersReady(limit = 80): Promise<ReadyRow[]> {
  const orders = await db.order.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      customerName: true,
      workOrderStatus: true,
      workOrderNumber: true,
      depositStatus: true,
      proofRequired: true,
      proofStatus: true,
      artFileStatus: true,
      garmentOrderNeeded: true,
      garmentOrderStatus: true,
      deletedAt: true,
      status: true,
    },
  });

  return orders.map((o) => {
    const { ready, blockers } = isWorkOrderReady(o);
    return {
      orderId: o.id,
      customerName: o.customerName,
      ready,
      workOrderStatus: normWoStatus(o.workOrderStatus),
      workOrderNumber: o.workOrderNumber ?? null,
      blockers,
    };
  });
}
