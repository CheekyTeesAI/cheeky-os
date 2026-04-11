import { db } from "../db/client";

const BASE_TASKS = ["Order Blanks", "QC + Pack"] as const;

function normalizePrintMethod(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[_\s-]+/g, "");
}

function tasksForMethod(method: string): string[] {
  if (method === "DTG") return ["Print DTG"];
  if (method === "DTF") return ["Print DTF"];
  if (method === "SCREEN") return ["Burn Screen", "Print Screen"];
  if (method === "HEATPRESS") return ["Press Heat Transfer"];
  return [];
}

export async function generateTasksForOrder(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      lineItems: true,
      tasks: {
        select: { title: true },
      },
    },
  });

  if (!order) return;

  const required = new Set<string>(BASE_TASKS);

  for (const lineItem of order.lineItems ?? []) {
    const li = lineItem as unknown as {
      printMethod?: string | null;
      productionType?: string | null;
    };
    const method = normalizePrintMethod(li.printMethod ?? li.productionType ?? "");
    for (const title of tasksForMethod(method)) {
      required.add(title);
    }
  }

  const existingTitles = new Set(
    (order.tasks ?? []).map((task) => task.title)
  );

  const toCreate = [...required].filter((title) => !existingTitles.has(title));
  if (toCreate.length === 0) return;

  await db.task.createMany({
    data: toCreate.map((title) => ({
      orderId,
      title,
      status: "PENDING",
      dueDate: null,
    })),
  });
}
