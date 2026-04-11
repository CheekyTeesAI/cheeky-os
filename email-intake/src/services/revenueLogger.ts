export type RevenueEventType =
  | "estimate_created"
  | "estimate_sent"
  | "follow_up_triggered"
  | "SALES_MESSAGE_GENERATED"
  | "SALES_AGENT_SENT"
  | "SALES_AGENT_SKIPPED"
  | "SALES_REVIVE_RUN"
  | "PAYMENT_CLOSE_RUN"
  | "PAYMENT_NUDGE_SENT"
  | "PAYMENT_SKIPPED"
  | "OPERATOR_BRIEFING_REQUESTED"
  | "OPERATOR_NEXT_ACTIONS_REQUESTED";

export function logRevenueEvent(
  type: RevenueEventType,
  orderId: string,
  detail: string
): void {
  console.log(`[REVENUE EVENT] ${type} → ${orderId} → ${detail}`);
}
