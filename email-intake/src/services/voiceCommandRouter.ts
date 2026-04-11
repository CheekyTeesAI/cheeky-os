import { getTodayActions } from "./todayService";
import { evaluateOperationSafety } from "./safetyGuardService";

function emptyActions(): {
  printQueue: never[];
  needsReview: never[];
  urgentOrders: never[];
  blockedOrders: never[];
} {
  return {
    printQueue: [],
    needsReview: [],
    urgentOrders: [],
    blockedOrders: [],
  };
}

/**
 * Prep-only voice hook: no AI, no external APIs, no background work.
 */
export async function getTodayWork(): Promise<{
  success: boolean;
  printQueue: unknown[];
  needsReview: unknown[];
  urgentOrders: unknown[];
  blockedOrders: unknown[];
}> {
  const gate = evaluateOperationSafety({ operation: "voice_get_today_work" });
  if (!gate.allowed) {
    return { success: false, ...emptyActions() };
  }
  try {
    const actions = await getTodayActions();
    return { success: true, ...actions };
  } catch {
    return { success: false, ...emptyActions() };
  }
}

export async function getUrgentOrders(): Promise<{
  success: boolean;
  orders: unknown[];
}> {
  const gate = evaluateOperationSafety({ operation: "voice_get_urgent_orders" });
  if (!gate.allowed) {
    return { success: true, orders: [] };
  }
  try {
    const { urgentOrders } = await getTodayActions();
    return { success: true, orders: urgentOrders };
  } catch {
    return { success: true, orders: [] };
  }
}

export async function getPendingApprovals(): Promise<{
  success: boolean;
  pending: unknown[];
  note: string;
}> {
  const gate = evaluateOperationSafety({
    operation: "voice_get_pending_approvals",
  });
  if (!gate.allowed) {
    return {
      success: true,
      pending: [],
      note: "Operation blocked by safety guard.",
    };
  }
  try {
    const { needsReview } = await getTodayActions();
    return {
      success: true,
      pending: needsReview,
      note:
        "Derived from open exception reviews and manual-override orders (prep layer).",
    };
  } catch {
    return {
      success: true,
      pending: [],
      note: "Placeholder: approvals feed unavailable.",
    };
  }
}
