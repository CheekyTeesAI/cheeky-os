import type { SalesState } from "./salesState.service";
import type { ProductionState } from "./productionState.service";
import {
  getTopProductionPriorities,
  getTopSalesPriorities
} from "./prioritization.service";

export type ActionQueue = {
  ownerActions: string[];
  salesActions: string[];
  productionActions: string[];
  automationSuggestions: string[];
};

export function buildActionQueue({
  salesState,
  productionState
}: {
  salesState: SalesState;
  productionState: ProductionState;
}): ActionQueue {
  const salesTop = getTopSalesPriorities(salesState);
  const prodTop = getTopProductionPriorities(productionState);

  const ownerActions: string[] = [];
  if (productionState.summary.rushJobCount > 0) {
    ownerActions.push("Approve rush DTG queue first — block press until rush print clears");
  }
  if (salesTop.length >= 2) {
    ownerActions.push(`Call top 2 open estimates today — start with ${salesTop[0]?.name || "lead A"}`);
  } else if (salesTop.length === 1) {
    ownerActions.push(`Close or call ${salesTop[0].name} — highest remaining sales priority`);
  }
  if (ownerActions.length < 2 && salesState.revenue.unpaidInvoiceCount > 0) {
    ownerActions.push(`Collect on ${salesState.revenue.unpaidInvoiceCount} unpaid invoice(s) before 3pm`);
  }
  if (ownerActions.length < 3 && prodTop[0]) {
    ownerActions.push(`Lock production start order: ${prodTop[0].name} (${prodTop[0].qty} pcs)`);
  }

  const salesActions: string[] = [];
  if (salesState.revenue.estimateCount > 4) {
    salesActions.push("Follow up stale estimates — same-day text + email");
  }
  salesActions.push("Close high-value deals at CLOSE_ATTEMPT stage — deposit link ready");
  if (salesState.revenue.unpaidInvoiceCount > 2) {
    salesActions.push("Push deposits on unpaid invoices — prioritize largest balance");
  }

  const productionActions: string[] = [];
  productionActions.push("Start rush jobs first — pretreat one batch ahead of DTG");
  productionActions.push("Batch DTG light garments before dark — single wipe cycle");
  productionActions.push("Prep press queue so heat presses never sit idle");

  const automationSuggestions: string[] = [];
  if (salesState.revenue.estimateCount >= 5) {
    automationSuggestions.push("auto-followups should run now");
  }
  if (productionState.summary.rushJobCount > 2) {
    automationSuggestions.push("auto-schedule should rebalance Rush vs standard blocks");
  }
  if (salesState.activity.recentCustomers < 2 && salesState.pipeline.openDeals < 4) {
    automationSuggestions.push("generate-revenue should run");
  }

  return {
    ownerActions: ownerActions.slice(0, 6),
    salesActions: salesActions.slice(0, 6),
    productionActions: productionActions.slice(0, 6),
    automationSuggestions: automationSuggestions.slice(0, 4)
  };
}
