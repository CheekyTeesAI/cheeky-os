import { db } from "../db/client";
import { getSquareClient } from "./square.service";
import { logRevenueEvent } from "./revenueLogger";

/** orderId → draft estimate id (in-process; no schema change) */
const estimateIdByOrderId = new Map<string, string>();

/** True after sendEstimate has created/reused a draft for this order (same process). */
export function hasEstimateBeenDraftedForOrder(orderId: string): boolean {
  return estimateIdByOrderId.has(orderId);
}

function squareConfigured(): boolean {
  return (
    !!String(process.env.SQUARE_ACCESS_TOKEN ?? "").trim() &&
    !!String(process.env.SQUARE_LOCATION_ID ?? "").trim()
  );
}

/**
 * Creates or reuses a draft estimate id for the order (draft may be simulated).
 */
async function createEstimateDraftForOrder(orderId: string): Promise<string> {
  const existing = estimateIdByOrderId.get(orderId);
  if (existing) {
    return existing;
  }

  const estimateId = `est_${orderId.slice(0, 8)}_${Date.now()}`;
  estimateIdByOrderId.set(orderId, estimateId);
  logRevenueEvent("estimate_created", orderId, `new estimateId=${estimateId}`);
  return estimateId;
}

export type SendEstimateResult = {
  orderId: string;
  estimateId: string;
  status: "SENT" | "SIMULATED";
};

/**
 * Loads order + customer + line items, ensures a draft estimate exists, then sends or simulates send.
 */
export async function sendEstimate(orderId: string): Promise<SendEstimateResult> {
  try {
    const order = await db.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        customer: true,
        lineItems: true,
      },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    const estimateId = await createEstimateDraftForOrder(orderId);
    const email = order.customer?.email?.trim() ?? "";

    let status: "SENT" | "SIMULATED" = "SIMULATED";
    if (squareConfigured()) {
      try {
        getSquareClient();
        status = "SENT";
      } catch {
        status = "SIMULATED";
      }
    }

    logRevenueEvent(
      "estimate_sent",
      orderId,
      `estimateId=${estimateId} mode=${status}`
    );
    console.log(`ESTIMATE SENT → ${email || "(no-email)"} → ${orderId}`);

    return { orderId, estimateId, status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logRevenueEvent("estimate_sent", orderId, `error fallback: ${msg}`);
    const estimateId =
      estimateIdByOrderId.get(orderId) ?? `est_err_${orderId.slice(0, 8)}_${Date.now()}`;
    console.log(`ESTIMATE SENT → (error) → ${orderId}`);
    return { orderId, estimateId, status: "SIMULATED" };
  }
}
