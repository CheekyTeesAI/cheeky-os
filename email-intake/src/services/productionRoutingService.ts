import {
  INITIAL_PRODUCTION_QUEUE_STATE,
  persistedQueueStatusForNormalized,
} from "../lib/productionQueue";
import { db } from "../db/client";
import { OrderNotFoundError } from "./orderEvaluator";
import { assertActionAllowed } from "./safetyGuard.service";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import { logger } from "../utils/logger";

const BULLSEYE = "Bullseye";
const CHARLENE = "Charlene";

export type RouteProductionResult = {
  success: true;
  idempotent?: boolean;
  route: {
    productionType: string;
    assignee: string;
    rationale: string;
  };
};

/** Normalize parser / manual values to routing lane codes. */
function normalizePrintMethod(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const u = String(raw).trim().toUpperCase();
  if (!u) return null;
  if (u.includes("EMBROID") || u === "EMB") return "EMB";
  if (u.includes("SCREEN")) return "SCREEN";
  if (u.includes("DTF")) return "DTF";
  if (u.includes("DTG")) return "DTG";
  return u;
}

function notesLower(notes: string | null | undefined): string {
  return String(notes ?? "").toLowerCase();
}

function hasOutsourceNote(order: { notes: string }): boolean {
  return notesLower(order.notes).includes("outsource");
}

function hasRushNote(order: { notes: string; isRush: boolean }): boolean {
  return order.isRush === true || notesLower(order.notes).includes("rush");
}

/**
 * Deterministic core routing (quantity minimums + print method).
 * DTG/DTF/EMB min 12, SCREEN min 24 used in rule selection only.
 */
function decideBaseRoute(order: {
  printMethod: string | null;
  quantity: number | null;
  notes: string;
}): {
  productionType: string;
  assignee: string;
  rationale: string;
} {
  const qty = order.quantity ?? 0;
  const pm = normalizePrintMethod(order.printMethod);

  if (pm === null) {
    return {
      productionType: "DTG",
      assignee: CHARLENE,
      rationale:
        "Print method was not set; assumed DTG and assigned Charlene per safe default.",
    };
  }

  if (pm === "SCREEN") {
    if (qty >= 24) {
      return {
        productionType: "SCREEN",
        assignee: BULLSEYE,
        rationale:
          "Screen print with quantity meeting minimum (24+); routed to Bullseye.",
      };
    }
    return {
      productionType: "DTF",
      assignee: CHARLENE,
      rationale:
        "Screen print requested but quantity is below the 24-piece screen minimum; falling back to DTF with Charlene.",
    };
  }

  if (pm === "EMB") {
    if (qty >= 12) {
      return {
        productionType: "EMB",
        assignee: BULLSEYE,
        rationale:
          "Embroidery with quantity meeting minimum (12+); routed to Bullseye.",
      };
    }
    return {
      productionType: "EMB",
      assignee: BULLSEYE,
      rationale:
        "Embroidery below the usual 12-piece minimum; still routed to Bullseye for digitizing/production — manual review may be needed (routing only, not quoting).",
    };
  }

  if (pm === "DTG") {
    return {
      productionType: "DTG",
      assignee: CHARLENE,
      rationale: "DTG; assigned Charlene.",
    };
  }

  if (pm === "DTF") {
    return {
      productionType: "DTF",
      assignee: CHARLENE,
      rationale: "DTF; assigned Charlene.",
    };
  }

  return {
    productionType: "DTG",
    assignee: CHARLENE,
    rationale: `Unrecognized print method "${order.printMethod}"; defaulted to DTG and Charlene.`,
  };
}

function applyOutsourceAndRush(
  order: { notes: string; isRush: boolean },
  base: { productionType: string; assignee: string; rationale: string }
): { productionType: string; assignee: string; rationale: string } {
  let { productionType, assignee, rationale } = base;

  if (hasOutsourceNote(order)) {
    assignee = BULLSEYE;
    rationale = `${rationale} Customer notes request outsourcing; assignee set to Bullseye.`;
  } else if (
    hasRushNote(order) &&
    (productionType === "DTG" || productionType === "DTF")
  ) {
    assignee = CHARLENE;
    rationale = `${rationale} Rush noted; favoring in-house Charlene for ${productionType}.`;
  }

  return { productionType, assignee, rationale };
}

async function backfillOrderAndJobFromRoute(
  orderId: string,
  job: { id: string } | null,
  routeRow: {
    id: string;
    jobId: string | null;
    productionType: string;
    assignee: string;
    rationale: string;
  }
): Promise<void> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const now = new Date();

  await db.order.update({
    where: { id: orderId },
    data: {
      routingStatus: order.routingStatus ?? "ROUTED",
      routedAt: order.routedAt ?? now,
      productionTypeFinal: order.productionTypeFinal ?? routeRow.productionType,
      assignedProductionTo: order.assignedProductionTo ?? routeRow.assignee,
    },
  });

  if (!job) {
    return;
  }

  if (!routeRow.jobId) {
    await db.productionRoute.update({
      where: { id: routeRow.id },
      data: { jobId: job.id },
    });
  }

  const j = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  await db.job.update({
    where: { id: job.id },
    data: {
      assignedTo: j.assignedTo ?? routeRow.assignee,
      productionType: j.productionType ?? routeRow.productionType,
      routingNotes: j.routingNotes ?? routeRow.rationale,
    },
  });
}

export async function routeProductionForOrder(
  orderId: string
): Promise<RouteProductionResult> {
  const id = String(orderId ?? "").trim();
  if (!id) {
    throw new Error("Missing order id");
  }

  const order = await db.order.findUnique({ where: { id } });
  if (!order) {
    throw new OrderNotFoundError(id);
  }

  assertActionAllowed(order, "ROUTE_PRODUCTION");

  const job = await db.job.findUnique({ where: { orderId: id } });

  const existingRoute = await db.productionRoute.findUnique({
    where: { orderId: id },
  });

  if (existingRoute) {
    await backfillOrderAndJobFromRoute(id, job, {
      id: existingRoute.id,
      jobId: existingRoute.jobId,
      productionType: existingRoute.productionType,
      assignee: existingRoute.assignee,
      rationale: existingRoute.rationale,
    });

    try {
      await syncOrderToSharePoint(id);
    } catch (spErr) {
      const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
      logger.warn(
        `productionRoutingService: SharePoint sync failed for ${id}: ${spMsg}`
      );
    }

    return {
      success: true,
      idempotent: true,
      route: {
        productionType: existingRoute.productionType,
        assignee: existingRoute.assignee,
        rationale: existingRoute.rationale,
      },
    };
  }

  const base = decideBaseRoute({
    printMethod: order.printMethod,
    quantity: order.quantity,
    notes: order.notes,
  });
  const decision = applyOutsourceAndRush(
    { notes: order.notes, isRush: order.isRush },
    base
  );

  const now = new Date();

  const queueReady = persistedQueueStatusForNormalized(
    INITIAL_PRODUCTION_QUEUE_STATE
  );

  await db.$transaction(async (tx) => {
    const route = await tx.productionRoute.create({
      data: {
        orderId: id,
        jobId: job?.id ?? null,
        routeStatus: "ROUTED",
        productionType: decision.productionType,
        assignee: decision.assignee,
        rationale: decision.rationale.trim(),
        overridden: false,
      },
    });

    await tx.order.update({
      where: { id },
      data: {
        routingStatus: "ROUTED",
        routedAt: now,
        assignedProductionTo: decision.assignee,
        productionTypeFinal: decision.productionType,
        status:
          String(order.status ?? "").toUpperCase() === "PAID_IN_FULL"
            ? "PAID_IN_FULL"
            : "PRODUCTION_READY",
      },
    });

    if (job) {
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: queueReady,
          assignedTo: decision.assignee,
          productionType: decision.productionType,
          routingNotes: decision.rationale.trim(),
        },
      });
    }
  });

  try {
    await syncOrderToSharePoint(id);
  } catch (spErr) {
    const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
    logger.warn(`productionRoutingService: SharePoint sync failed for ${id}: ${spMsg}`);
  }

  return {
    success: true,
    route: {
      productionType: decision.productionType,
      assignee: decision.assignee,
      rationale: decision.rationale.trim(),
    },
  };
}
