export type PriorityLevel = "low" | "medium" | "high" | "critical";

export type OrderPriorityInput = {
  /** Preferred due date; falls back to quote/invoice expiry in callers. */
  dueDate?: Date | string | null;
  total?: number | null;
  quotedAmount?: number | null;
  status?: string | null;
  isRush?: boolean | null;
  blockedReason?: string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysFromNow(d: Date): number {
  const now = new Date();
  return (d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
}

/**
 * Lightweight deterministic score (no I/O, no loops over datasets).
 */
export function calculateOrderPriority(
  input: OrderPriorityInput
): { priorityScore: number; priorityLevel: PriorityLevel } {
  let score = 0;

  const st = String(input.status ?? "").trim().toUpperCase();
  const blocked = String(input.blockedReason ?? "").trim().length > 0;

  const due = toDate(input.dueDate);
  if (due) {
    const days = daysFromNow(due);
    if (days <= 1) score += 45;
    else if (days <= 3) score += 28;
    else if (days <= 7) score += 12;
    else if (days <= 14) score += 4;
  }

  const money = input.total ?? input.quotedAmount ?? 0;
  if (money > 0) {
    score += Math.min(40, Math.floor(money / 50));
  }

  if (input.isRush === true) score += 15;

  if (blocked || st === "BLOCKED") score -= 12;
  if (st === "INTAKE") score += 4;
  if (st === "QUOTE_READY" || st === "QUOTE_SENT" || st === "INVOICE_DRAFTED") {
    score += 6;
  }
  if (st === "PRODUCTION_READY" || st === "DEPOSIT_PAID") score += 8;

  score = Math.max(0, Math.round(score));

  let priorityLevel: PriorityLevel;
  if (score >= 72) priorityLevel = "critical";
  else if (score >= 48) priorityLevel = "high";
  else if (score >= 24) priorityLevel = "medium";
  else priorityLevel = "low";

  return { priorityScore: score, priorityLevel };
}
