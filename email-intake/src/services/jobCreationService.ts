import type { Job, Task } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { OrderNotFoundError } from "./orderEvaluator";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import { notifyProductionReady } from "./teamsNotificationService";
import { createDigitizingRequestForOrder } from "./digitizingService";
import { routeProductionForOrder } from "./productionRoutingService";
import { assertActionAllowed } from "./safetyGuard.service";

const INITIAL_TASKS: Array<{ title: string; type: string }> = [
  {
    title: "Review artwork and order details",
    type: "ART_REVIEW",
  },
  {
    title: "Order garments / confirm blanks",
    type: "ORDER_GARMENTS",
  },
  {
    title: "Prepare production setup",
    type: "PREP_PRODUCTION",
  },
];

export type CreateJobResult = {
  success: true;
  job: Job & { tasks: Task[] };
  tasksCreated: number;
  message?: string;
};

export class OrderNotEligibleForJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotEligibleForJobError";
  }
}

export async function createJobForDepositedOrder(
  orderId: string
): Promise<CreateJobResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  const st = String(order.status || "").toUpperCase();

  const existing = await db.job.findUnique({
    where: { orderId },
    include: { tasks: true },
  });

  if (existing) {
    try {
      await routeProductionForOrder(orderId);
    } catch (routeErr) {
      const rMsg =
        routeErr instanceof Error ? routeErr.message : String(routeErr);
      logger.warn(
        `jobCreationService: production routing hook failed for ${orderId}: ${rMsg}`
      );
    }
    return {
      success: true,
      job: existing,
      tasksCreated: 0,
      message: "Job already exists",
    };
  }

  assertActionAllowed(order, "CREATE_JOB");

  const productionType = order.printMethod ?? "DTG";
  const now = new Date();
  const nextOrderStatus =
    st === "PAID_IN_FULL" ? order.status : "PRODUCTION_READY";

  const result = await db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        orderId,
        status: "PRODUCTION_READY",
        productionType,
        notes: order.notes || null,
      },
    });

    await tx.task.createMany({
      data: INITIAL_TASKS.map((t) => ({
        jobId: job.id,
        title: t.title,
        type: t.type,
        status: "TODO",
      })),
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        jobCreated: true,
        jobCreatedAt: now,
        status: nextOrderStatus,
        productionStatus: "PRODUCTION_READY",
      },
    });

    const full = await tx.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { tasks: true },
    });

    return full;
  });

  try {
    await syncOrderToSharePoint(orderId);
  } catch (spErr) {
    const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
    logger.warn(`jobCreationService: SharePoint sync failed for ${orderId}: ${spMsg}`);
  }

  const teamsProd = await notifyProductionReady(orderId);
  if (teamsProd.success === false) {
    logger.warn(
      `Teams notifyProductionReady failed for ${orderId}: ${teamsProd.error}`
    );
  }

  const printU = String(order.printMethod ?? "").toUpperCase();
  if (printU.includes("EMB")) {
    try {
      await createDigitizingRequestForOrder(orderId);
    } catch (digErr) {
      const dMsg =
        digErr instanceof Error ? digErr.message : String(digErr);
      logger.warn(
        `jobCreationService: digitizing hook failed for ${orderId}: ${dMsg}`
      );
    }
  }

  try {
    await routeProductionForOrder(orderId);
  } catch (routeErr) {
    const rMsg =
      routeErr instanceof Error ? routeErr.message : String(routeErr);
    logger.warn(
      `jobCreationService: production routing hook failed for ${orderId}: ${rMsg}`
    );
  }

  return {
    success: true,
    job: result,
    tasksCreated: INITIAL_TASKS.length,
  };
}
