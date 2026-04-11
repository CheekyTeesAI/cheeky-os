import {
  getSalesState,
  type SalesState
} from "./salesState.service";
import {
  getProductionState,
  type ProductionState
} from "./productionState.service";
import { getTopProductionPriorities, getTopSalesPriorities } from "./prioritization.service";
import { buildActionQueue } from "./actionQueue.service";

export type HealthStatus = "STABLE" | "WARNING" | "CRITICAL";

export type BusinessStatePayload = {
  timestamp: string;
  sales: SalesState;
  production: ProductionState;
  priorities: {
    sales: ReturnType<typeof getTopSalesPriorities>;
    production: ReturnType<typeof getTopProductionPriorities>;
  };
  actions: ReturnType<typeof buildActionQueue>;
  health: {
    status: HealthStatus;
    reasons: string[];
  };
};

function computeHealth(sales: SalesState, prod: ProductionState): {
  status: HealthStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  const estimateLow = sales.revenue.estimateCount < 3;
  const revenueLow = sales.revenue.recentInvoiceTotal < 1000;
  const rushOverload = prod.summary.rushJobCount > 3;
  const fewDeals = sales.pipeline.openDeals < 4;
  const missingDueHeavy = prod.jobs.filter((j) => !j.dueDate).length >= 3;
  const moderateLoad = prod.summary.activeJobCount >= 6 && prod.summary.activeJobCount <= 8;

  if ((estimateLow && revenueLow) || rushOverload) {
    if (estimateLow && revenueLow) {
      reasons.push("Estimate pipeline thin and recent invoice total soft");
    }
    if (rushOverload) {
      reasons.push("Rush production load beyond comfort zone");
    }
    return { status: "CRITICAL", reasons };
  }

  if (moderateLoad || fewDeals || missingDueHeavy || prod.bottlenecks.length >= 2) {
    if (moderateLoad) reasons.push("Production load elevated");
    if (fewDeals) reasons.push("Pipeline adequate but not strong");
    if (missingDueHeavy) reasons.push("Several jobs lack due dates");
    if (prod.bottlenecks.length >= 2) reasons.push("Multiple production bottlenecks flagged");
    return { status: "WARNING", reasons: reasons.length ? reasons : ["Review bottlenecks"] };
  }

  return { status: "STABLE", reasons: ["Flows within normal bands"] };
}

export async function getBusinessState(): Promise<BusinessStatePayload> {
  const [sales, production] = await Promise.all([getSalesState(), getProductionState()]);

  const priorities = {
    sales: getTopSalesPriorities(sales),
    production: getTopProductionPriorities(production)
  };
  const actions = buildActionQueue({ salesState: sales, productionState: production });
  const health = computeHealth(sales, production);

  return {
    timestamp: new Date().toISOString(),
    sales,
    production,
    priorities,
    actions,
    health
  };
}
