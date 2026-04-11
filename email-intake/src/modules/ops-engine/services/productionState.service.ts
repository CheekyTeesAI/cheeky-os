import { getActiveOrders } from "../../production/getActiveOrders";

export type ProductionJobNormalized = {
  id: string;
  name: string;
  qty: number;
  type: "DTG" | "DTF" | "ScreenPrint" | "Unknown";
  dueDate: string | null;
  rush: boolean;
  status: string | null;
};

export type ProductionState = {
  jobs: ProductionJobNormalized[];
  summary: {
    activeJobCount: number;
    rushJobCount: number;
    dtgCount: number;
    dtfCount: number;
    screenPrintCount: number;
  };
  bottlenecks: string[];
};

function normalizeType(t: string): ProductionJobNormalized["type"] {
  if (t === "DTG" || t === "DTF" || t === "ScreenPrint") return t;
  return "Unknown";
}

function detectBottlenecks(jobs: ProductionJobNormalized[]): string[] {
  const b: string[] = [];
  const rush = jobs.filter((j) => j.rush).length;
  const dtg = jobs.filter((j) => j.type === "DTG").length;
  const missingDue = jobs.filter((j) => !j.dueDate || j.dueDate.trim() === "").length;
  const active = jobs.length;

  if (rush > 3) {
    b.push("Rush production overloaded — sequenced queue required");
  }
  if (dtg > 4) {
    b.push("DTG queue overloaded — batch light/dark and cap starts");
  }
  if (missingDue >= 2) {
    b.push(`${missingDue} jobs missing due dates — set dates before 10am`);
  }
  if (active > 8) {
    b.push("Overloaded day — delay lowest priority job to tomorrow");
  }
  return b;
}

export async function getProductionState(): Promise<ProductionState> {
  let raw: Awaited<ReturnType<typeof getActiveOrders>> = [];
  try {
    raw = await getActiveOrders();
  } catch {
    raw = [];
  }

  const jobs: ProductionJobNormalized[] = raw.map((j, i) => ({
    id: j.id || `dv-${i}-${String(j.name).replace(/\s+/g, "-").slice(0, 24)}`,
    name: j.name,
    qty: j.qty,
    type: normalizeType(j.type),
    dueDate: j.dueDate ? j.dueDate : null,
    rush: j.rush,
    status: j.status || null
  }));

  const dtgCount = jobs.filter((j) => j.type === "DTG").length;
  const dtfCount = jobs.filter((j) => j.type === "DTF").length;
  const screenPrintCount = jobs.filter((j) => j.type === "ScreenPrint").length;

  return {
    jobs,
    summary: {
      activeJobCount: jobs.length,
      rushJobCount: jobs.filter((j) => j.rush).length,
      dtgCount,
      dtfCount,
      screenPrintCount
    },
    bottlenecks: detectBottlenecks(jobs)
  };
}
