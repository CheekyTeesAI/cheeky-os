import type { ExceptionReview } from "@prisma/client";
import { db } from "../db/client";
import { logger } from "../utils/logger";

export type CreateExceptionReviewInput = {
  orderId?: string | null;
  jobId?: string | null;
  type: string;
  source: string;
  severity: string;
  message: string;
  detailsJson?: string | null;
};

export async function createExceptionReview(
  input: CreateExceptionReviewInput
): Promise<ExceptionReview> {
  const message = String(input.message ?? "").slice(0, 4000);
  return db.exceptionReview.create({
    data: {
      orderId: input.orderId ?? null,
      jobId: input.jobId ?? null,
      type: input.type,
      source: input.source,
      severity: input.severity,
      message,
      detailsJson: input.detailsJson ?? null,
    },
  });
}

/** Fire-and-forget; never throws to callers. */
export function logExceptionReviewSafe(input: CreateExceptionReviewInput): void {
  void createExceptionReview(input).catch((e) => {
    const m = e instanceof Error ? e.message : String(e);
    logger.warn(`exceptionReviewService: failed to record exception: ${m}`);
  });
}

export async function resolveExceptionReview(
  id: string,
  resolvedBy: string
): Promise<ExceptionReview> {
  const row = await db.exceptionReview.findUnique({ where: { id } });
  if (!row) {
    throw new Error(`ExceptionReview not found: ${id}`);
  }
  if (row.resolved) {
    return row;
  }
  return db.exceptionReview.update({
    where: { id },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: String(resolvedBy ?? "").trim() || "unknown",
    },
  });
}

export async function getOpenExceptions(): Promise<ExceptionReview[]> {
  return db.exceptionReview.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
  });
}
