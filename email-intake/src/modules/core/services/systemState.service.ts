import { getActiveLeads, type ActiveLead } from "../../production/getActiveLeads";
import { getActiveOrders, type Job } from "../../production/getActiveOrders";
import { getActiveTasks, type ActiveTask } from "../../production/getActiveTasks";

export type SystemState = {
  orders: Job[];
  tasks: ActiveTask[];
  leads: ActiveLead[];
  productionQueue: Job[];
  salesPipeline: ActiveLead[];
};

function byProductionPriority(a: Job, b: Job): number {
  if (a.rush !== b.rush) return a.rush ? -1 : 1;
  const at = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bt = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return b.qty - a.qty;
}

function bySalesPriority(a: ActiveLead, b: ActiveLead): number {
  if (b.value !== a.value) return b.value - a.value;
  const at = a.lastActivityDate ? new Date(a.lastActivityDate).getTime() : 0;
  const bt = b.lastActivityDate ? new Date(b.lastActivityDate).getTime() : 0;
  return at - bt;
}

export async function getSystemState(): Promise<SystemState> {
  const [orders, tasks, leads] = await Promise.all([
    getActiveOrders().catch(() => []),
    getActiveTasks().catch(() => []),
    getActiveLeads().catch(() => [])
  ]);

  return {
    orders,
    tasks,
    leads,
    productionQueue: [...orders].sort(byProductionPriority),
    salesPipeline: [...leads].sort(bySalesPriority)
  };
}
