import { getSystemState } from "../core/services/systemState.service";
import { generateActions, type DecisionAction } from "./actionGenerator.service";
import { scoreOrder } from "./priorityScoring.service";

function impactRank(v: DecisionAction["impact"]): number {
  if (v === "High") return 3;
  if (v === "Medium") return 2;
  return 1;
}

export async function getNextBestActions(): Promise<DecisionAction[]> {
  const system = await getSystemState();

  const scoredOrders = system.orders.map((order) => {
    const result = scoreOrder(order);
    return { order, score: result.score, reasons: result.reasons };
  });

  scoredOrders.sort((a, b) => b.score - a.score);

  const actions = generateActions({
    scoredOrders: scoredOrders.slice(0, 8),
    tasks: system.tasks.slice(0, 8),
    leads: system.leads.slice(0, 12),
    productionOverloaded: system.productionQueue.length > 8
  });

  return actions
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact))
    .slice(0, 5);
}
