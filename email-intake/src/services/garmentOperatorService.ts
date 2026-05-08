import { OrderDepositStatus } from "@prisma/client";
import { db } from "../db/client";
import { OrderNotFoundError } from "./orderEvaluator";
import { GarmentOrderStatus } from "./garmentOrderFlowService";

const MS_DAY = 86400000;

function isOrderedLike(s: string | null | undefined): boolean {
  const u = String(s ?? "").toUpperCase();
  return (
    u === GarmentOrderStatus.ORDERED ||
    u === "SUBMITTED" ||
    u === "CONFIRMED"
  );
}

function isPendingLike(s: string | null | undefined): boolean {
  const u = String(s ?? "").toUpperCase();
  return (
    u === GarmentOrderStatus.ORDER_PENDING ||
    u === GarmentOrderStatus.NEEDED ||
    u === ""
  );
}

export type GarmentOrderListItem = {
  orderId: string;
  customerName: string;
  garmentOrderStatus: string;
  taskId: string | null;
  title: string | null;
  dueDate: string | null;
  stage: string;
  priority: number;
  /** Days since order last update (rough staleness for digest). */
  daysSinceActivity: number;
};

function priorityScore(row: {
  garmentOrderStatus: string | null;
  garmentOrderPlacedAt: Date | null;
}): number {
  const st = String(row.garmentOrderStatus ?? "").toUpperCase();
  if (isPendingLike(st)) return 0;
  if (isOrderedLike(st)) {
    const placed = row.garmentOrderPlacedAt?.getTime() ?? 0;
    const days = placed ? (Date.now() - placed) / MS_DAY : 99;
    return days >= 5 ? 1 : 2;
  }
  return 5;
}

/**
 * Orders that need garment ordering attention (PostgreSQL Order + Task).
 */
export async function listGarmentOrdersNeedingAttention(): Promise<
  GarmentOrderListItem[]
> {
  const rows = await db.order.findMany({
    where: {
      deletedAt: null,
      jobCreated: true,
      AND: [
        {
          OR: [
            { depositStatus: OrderDepositStatus.PAID },
            { depositReceived: true },
          ],
        },
        {
          status: {
            in: [
              "PRODUCTION_READY",
              "PAID_IN_FULL",
              "DEPOSIT_PAID",
              "PRINTING",
            ],
          },
        },
        {
          garmentOrderNeeded: true,
        },
        {
          OR: [
            { garmentOrderStatus: null },
            {
              garmentOrderStatus: {
                notIn: [
                  GarmentOrderStatus.NOT_NEEDED,
                  GarmentOrderStatus.RECEIVED,
                ],
              },
            },
          ],
        },
      ],
    },
    include: {
      tasks: {
        where: {
          OR: [{ type: "GARMENT_ORDER" }, { type: "ORDER_GARMENTS" }],
        },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
    take: 150,
    orderBy: { updatedAt: "desc" },
  });

  const now = Date.now();
  const out: GarmentOrderListItem[] = [];
  for (const o of rows) {
    const st = String(o.garmentOrderStatus ?? "").toUpperCase();
    if (st === "FAILED") continue;
    const t = o.tasks[0];
    const daysSinceActivity = Math.max(
      0,
      Math.floor((now - o.updatedAt.getTime()) / MS_DAY)
    );
    out.push({
      orderId: o.id,
      customerName: String(o.customerName || "").trim() || "Unknown",
      garmentOrderStatus: o.garmentOrderStatus || "",
      taskId: t?.id ?? null,
      title: t?.title ?? null,
      dueDate: t?.dueDate ? t.dueDate.toISOString() : null,
      stage: String(o.status),
      priority: priorityScore(o),
      daysSinceActivity,
    });
  }

  out.sort((a, b) => a.priority - b.priority || a.customerName.localeCompare(b.customerName));
  return out;
}

export type GarmentOrderPublicItem = Omit<GarmentOrderListItem, "priority">;

export async function buildGarmentOrdersPayload(): Promise<{
  success: true;
  count: number;
  items: GarmentOrderPublicItem[];
  spokenSummary: string;
}> {
  const items = await listGarmentOrdersNeedingAttention();
  const pending = items.filter((i) => isPendingLike(i.garmentOrderStatus));
  const ordered = items.filter((i) => isOrderedLike(i.garmentOrderStatus));
  const stalePending = pending.filter((i) => i.daysSinceActivity >= 1);

  let spoken = `You have ${items.length} garment order${items.length === 1 ? "" : "s"} needing attention.`;
  if (pending.length > 0) {
    spoken += ` ${pending.length} still pending placement.`;
  }
  if (stalePending.length > 0) {
    spoken += ` ${stalePending.length} pending over one day.`;
  }
  if (ordered.length > 0) {
    spoken += ` ${ordered.length} ordered, awaiting receive.`;
  }

  const publicItems = items.map(
    ({ priority: _p, ...rest }) => rest
  );

  return {
    success: true,
    count: items.length,
    items: publicItems,
    spokenSummary: spoken,
  };
}

export async function markGarmentsOrdered(orderId: string): Promise<{
  success: true;
  orderId: string;
  garmentOrderStatus: string;
  garmentOrderPlacedAt: string;
}> {
  const id = String(orderId ?? "").trim();
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) {
    throw new OrderNotFoundError(id);
  }
  const now = new Date();
  await db.order.update({
    where: { id },
    data: {
      garmentOrderStatus: GarmentOrderStatus.ORDERED,
      garmentOrderPlacedAt: now,
    },
  });
  await db.task.updateMany({
    where: {
      orderId: id,
      OR: [{ type: "GARMENT_ORDER" }, { type: "ORDER_GARMENTS" }],
    },
    data: { status: "DONE" },
  });
  return {
    success: true,
    orderId: id,
    garmentOrderStatus: GarmentOrderStatus.ORDERED,
    garmentOrderPlacedAt: now.toISOString(),
  };
}

export async function markGarmentsReceived(orderId: string): Promise<{
  success: true;
  orderId: string;
  garmentOrderStatus: string;
  garmentOrderReceivedAt: string;
}> {
  const id = String(orderId ?? "").trim();
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) {
    throw new OrderNotFoundError(id);
  }
  const now = new Date();
  await db.order.update({
    where: { id },
    data: {
      garmentOrderStatus: GarmentOrderStatus.RECEIVED,
      garmentOrderReceivedAt: now,
    },
  });
  return {
    success: true,
    orderId: id,
    garmentOrderStatus: GarmentOrderStatus.RECEIVED,
    garmentOrderReceivedAt: now.toISOString(),
  };
}

export async function getGarmentDigestSnapshot(): Promise<{
  garmentOrdersPending: number;
  garmentOrdersOrderedAwaitingReceive: number;
  productionReadyMissingGarmentTask: number;
}> {
  const items = await listGarmentOrdersNeedingAttention();
  const pending = items.filter((i) => isPendingLike(i.garmentOrderStatus)).length;
  const ordered = items.filter((i) => isOrderedLike(i.garmentOrderStatus)).length;

  const missingTask = await db.order.count({
    where: {
      deletedAt: null,
      jobCreated: true,
      garmentOrderNeeded: true,
      garmentOrderStatus: GarmentOrderStatus.ORDER_PENDING,
      NOT: {
        tasks: {
          some: {
            type: { in: ["GARMENT_ORDER", "ORDER_GARMENTS"] },
          },
        },
      },
    },
  });

  return {
    garmentOrdersPending: pending,
    garmentOrdersOrderedAwaitingReceive: ordered,
    productionReadyMissingGarmentTask: missingTask,
  };
}
