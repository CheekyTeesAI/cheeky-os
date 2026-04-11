import { LeadStage } from "../../command-layer/models/types";
import type { SalesState } from "./salesState.service";
import type { ProductionJobNormalized, ProductionState } from "./productionState.service";

export type SalesPriorityRow = {
  name: string;
  value: number;
  stage: LeadStage;
  recommendedAction: string;
};

export type ProductionPriorityRow = Pick<
  ProductionJobNormalized,
  "id" | "name" | "qty" | "type" | "dueDate" | "rush"
>;

function stageUrgency(stage: LeadStage): number {
  if (stage === LeadStage.CLOSE_ATTEMPT) return 5;
  if (stage === LeadStage.FOLLOW_UP) return 4;
  if (stage === LeadStage.QUOTED) return 3;
  if (stage === LeadStage.DEPOSIT_PAID) return 6;
  if (stage === LeadStage.CONTACTED) return 2;
  if (stage === LeadStage.NEW) return 1;
  return 0;
}

export function getTopSalesPriorities(salesState: SalesState): SalesPriorityRow[] {
  const rows = salesState.pipeline.nextBestActions.map((a) => ({
    name: a.name,
    value: a.value,
    stage: a.stage,
    recommendedAction: a.recommendedAction
  }));

  rows.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return stageUrgency(b.stage) - stageUrgency(a.stage);
  });

  return rows.slice(0, 5).map(({ name, value, stage, recommendedAction }) => ({
    name,
    value,
    stage,
    recommendedAction
  }));
}

export function getTopProductionPriorities(productionState: ProductionState): ProductionPriorityRow[] {
  const jobs = [...productionState.jobs];
  jobs.sort((a, b) => {
    if (a.rush !== b.rush) return a.rush ? -1 : 1;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (b.qty !== a.qty) return b.qty - a.qty;
    if (a.type === "DTG" && b.type !== "DTG") return -1;
    if (b.type === "DTG" && a.type !== "DTG") return 1;
    return 0;
  });

  return jobs.slice(0, 5).map((j) => ({
    id: j.id,
    name: j.name,
    qty: j.qty,
    type: j.type,
    dueDate: j.dueDate,
    rush: j.rush
  }));
}
