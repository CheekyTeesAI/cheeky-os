import type { Job, Task } from "@prisma/client";
import {
  describeProductionQueue,
  INITIAL_PRODUCTION_QUEUE_STATE,
  persistedQueueStatusForNormalized,
  transitionProductionQueueState,
} from "../lib/productionQueue";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { OrderNotFoundError } from "./orderEvaluator";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import { createDigitizingRequestForOrder } from "./digitizingService";
import { routeProductionForOrder } from "./productionRoutingService";
import { assertActionAllowed } from "./safetyGuard.service";
import { buildPostDepositGarmentFields } from "./garmentOrderFlowService";
import { ensureArtPrepTask } from "./artRoutingService";
import { ensureProofApprovalTask } from "./proofRoutingService";

const MINIMAL_PRODUCTION_TASKS: Array<{ title: string; type: string }> = [
  { title: "Art review", type: "ART_REVIEW" },
  { title: "Garment order", type: "GARMENT_ORDER" },
  { title: "Print prep", type: "PRINT_PREP" },
];

/** @deprecated Use MINIMAL_PRODUCTION_TASKS — kept name for routing scripts that import count */
const INITIAL_TASKS = MINIMAL_PRODUCTION_TASKS;

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

/**
 * Deposit webhook: create Job shell + order production fields only — no tasks, no production notifications.
 */
export async function ensureJobShellForDepositedOrder(
  orderId: string
): Promise<CreateJobResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { lineItems: true },
  });
  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  const existing = await db.job.findUnique({
    where: { orderId },
    include: { tasks: true },
  });
  if (existing) {
    return {
      success: true,
      job: existing,
      tasksCreated: 0,
      message: "job_shell_exists",
    };
  }

  assertActionAllowed(order, "CREATE_JOB");

  const productionType = order.printMethod ?? "DTG";
  const initialQueue = persistedQueueStatusForNormalized(
    INITIAL_PRODUCTION_QUEUE_STATE
  );
  const garmentFields = buildPostDepositGarmentFields(order);
  const now = new Date();

  const full = await db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        orderId,
        status: initialQueue,
        productionType,
        notes: order.notes || null,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        jobCreated: true,
        jobCreatedAt: now,
        productionStatus: initialQueue,
        ...garmentFields,
      },
    });

    return tx.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { tasks: true },
    });
  });

  logger.info(`jobCreationService: job shell only order=${orderId}`);

  try {
    await syncOrderToSharePoint(orderId);
  } catch (spErr) {
    const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
    logger.warn(
      `jobCreationService: SharePoint sync failed for ${orderId}: ${spMsg}`
    );
  }

  return {
    success: true,
    job: full,
    tasksCreated: 0,
    message: "job_shell_created",
  };
}

export async function createJobForDepositedOrder(
  orderId: string
): Promise<CreateJobResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { lineItems: true },
  });
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
    try {
      await ensureArtPrepTask(orderId);
    } catch (artErr) {
      const aMsg =
        artErr instanceof Error ? artErr.message : String(artErr);
      logger.warn(
        `jobCreationService: ensureArtPrepTask ${orderId}: ${aMsg}`
      );
    }
    try {
      await ensureProofApprovalTask(orderId);
    } catch (pErr) {
      const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
      logger.warn(
        `jobCreationService: ensureProofApprovalTask ${orderId}: ${pMsg}`
      );
    }
    return {
      success: true,
      job: existing,
      tasksCreated: 0,
      message: "Job already exists",
    };
  }

  if (st === "DEPOSIT_PAID") {
    return ensureJobShellForDepositedOrder(orderId);
  }

  assertActionAllowed(order, "CREATE_JOB");

  const productionType = order.printMethod ?? "DTG";
  const now = new Date();
  const nextOrderStatus =
    st === "PAID_IN_FULL" ? order.status : "PRODUCTION_READY";

  const initialQueue = persistedQueueStatusForNormalized(
    INITIAL_PRODUCTION_QUEUE_STATE
  );

  const garmentFields = buildPostDepositGarmentFields(order);

  const result = await db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        orderId,
        status: initialQueue,
        productionType,
        notes: order.notes || null,
      },
    });

    const orderLabel = order.orderNumber || orderId.slice(0, 8);
    await tx.task.createMany({
      data: INITIAL_TASKS.map((t) => {
        const title =
          t.type === "GARMENT_ORDER"
            ? `Order garments for Order #${orderLabel}`
            : t.title;
        return {
          orderId,
          jobId: job.id,
          title,
          type: t.type,
          status: "PENDING",
        };
      }),
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        jobCreated: true,
        jobCreatedAt: now,
        status: nextOrderStatus,
        productionStatus: initialQueue,
        ...garmentFields,
      },
    });

    const full = await tx.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { tasks: true },
    });

    return full;
  });

  const queueView = describeProductionQueue(initialQueue, { updatedAt: now });
  const stepCheck = transitionProductionQueueState(
    initialQueue,
    INITIAL_PRODUCTION_QUEUE_STATE
  );
  if (!stepCheck.allowed) {
    logger.warn(
      `jobCreationService: queue idempotent check failed for ${orderId}: ${stepCheck.reason}`
    );
  } else {
    logger.info(
      `jobCreationService: production queue lane=${queueView.normalizedState} label=${queueView.displayLabel} order=${orderId}`
    );
  }

  try {
    await syncOrderToSharePoint(orderId);
  } catch (spErr) {
    const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
    logger.warn(`jobCreationService: SharePoint sync failed for ${orderId}: ${spMsg}`);
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

  try {
    await ensureArtPrepTask(orderId);
  } catch (artErr) {
    const aMsg = artErr instanceof Error ? artErr.message : String(artErr);
    logger.warn(`jobCreationService: ensureArtPrepTask ${orderId}: ${aMsg}`);
  }

  try {
    await ensureProofApprovalTask(orderId);
  } catch (pErr) {
    const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
    logger.warn(`jobCreationService: ensureProofApprovalTask ${orderId}: ${pMsg}`);
  }

  return {
    success: true,
    job: result,
    tasksCreated: INITIAL_TASKS.length,
  };
}
