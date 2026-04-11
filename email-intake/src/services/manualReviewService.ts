import { db } from "../db/client";
import { resolveExceptionReview } from "./exceptionReviewService";
import { syncOrderToSharePoint } from "./sharepointOrderSync";
import { logger } from "../utils/logger";

export type ManualReviewResolveInput = {
  exceptionReviewId: string;
  resolvedBy: string;
  orderOverride?: {
    orderId: string;
    reason: string;
    by: string;
    clearBlockedReason?: boolean;
  };
};

export async function processManualReviewResolve(
  input: ManualReviewResolveInput
): Promise<{ success: true; exceptionReviewId: string }> {
  const exId = String(input.exceptionReviewId ?? "").trim();
  const resolvedBy = String(input.resolvedBy ?? "").trim();
  if (!exId) {
    throw new Error("exceptionReviewId is required");
  }
  if (!resolvedBy) {
    throw new Error("resolvedBy is required");
  }

  await resolveExceptionReview(exId, resolvedBy);

  if (input.orderOverride) {
    const { orderId, reason, by, clearBlockedReason } = input.orderOverride;
    const oid = String(orderId ?? "").trim();
    if (!oid) {
      throw new Error("orderOverride.orderId is required");
    }
    const now = new Date();
    await db.order.update({
      where: { id: oid },
      data: {
        manualOverride: true,
        manualOverrideReason: String(reason ?? "").trim() || null,
        manualOverrideBy: String(by ?? "").trim() || null,
        manualOverrideAt: now,
        ...(clearBlockedReason
          ? {
              blockedReason: null,
              status: "QUOTE_READY",
            }
          : {}),
      },
    });

    try {
      await syncOrderToSharePoint(oid);
    } catch (spErr) {
      const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
      logger.warn(`manualReviewService: SharePoint sync failed for ${oid}: ${spMsg}`);
    }
  }

  return { success: true, exceptionReviewId: exId };
}
