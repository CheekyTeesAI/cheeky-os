import { db } from "../db/client";
import { evaluateOrder as runFinancialEvaluation } from "../lib/financialEngine";
import { logExceptionReviewSafe } from "./exceptionReviewService";

const PLACEHOLDER_LABOR_HOURS = 1;
const PLACEHOLDER_BLANK_COST = 0;

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
  }
}

export async function evaluateOrderById(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  const revenue = order.quotedAmount ?? 0;
  const cost = order.estimatedCost ?? 0;
  const quantity = order.quantity ?? 0;
  const method = order.printMethod ?? "DTG";

  const result = runFinancialEvaluation({
    revenue,
    cost,
    laborHours: PLACEHOLDER_LABOR_HOURS,
    quantity,
    method,
    blankCost: PLACEHOLDER_BLANK_COST,
  });

  const margin = Number.isFinite(result.margin) ? result.margin : null;
  const pph = Number.isFinite(result.pph) ? result.pph : null;
  const blockedReason =
    result.errors.length > 0 ? result.errors.join("; ") : null;

  const updated = await db.order.update({
    where: { id: orderId },
    data: {
      margin,
      pph,
      depositRequired: result.depositRequired,
      isApproved: result.approved,
      blockedReason,
      status: result.approved ? "QUOTE_READY" : "BLOCKED",
    },
  });

  if (updated.blockedReason && updated.status === "BLOCKED") {
    logExceptionReviewSafe({
      orderId,
      jobId: null,
      type: "ORDER_EVALUATOR_BLOCKED",
      source: "EVALUATOR",
      severity: "HIGH",
      message: String(updated.blockedReason).slice(0, 2000),
      detailsJson: JSON.stringify({
        margin: updated.margin,
        pph: updated.pph,
        approved: updated.isApproved,
      }),
    });
  }

  return updated;
}
