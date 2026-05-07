import { OrderDepositStatus } from "@prisma/client";
import { db } from "../db/client";
import { ensureArtPrepTask } from "./artRoutingService";
import { shouldBlockPrintTasksForOrder } from "./productionPrintGateService";
import { ensureProofApprovalTask } from "./proofRoutingService";

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

function taskTypeForTitle(title: string): string {
  if (title === "Order Blanks") return "ORDER_BLANKS";
  if (title === "QC + Pack") return "QC_PACK";
  if (
    title.startsWith("Print ") ||
    title === "Burn Screen" ||
    title.startsWith("Press ")
  ) {
    return "PRINT";
  }
  return "OPS";
}

export async function generateTasksForOrder(orderId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { orderId } });
  if (!job) {
    return;
  }

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

  const ds = order.depositStatus ?? OrderDepositStatus.NONE;
  if (ds !== OrderDepositStatus.PAID && order.depositReceived !== true) {
    return;
  }

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
  const blockPrint = shouldBlockPrintTasksForOrder(order);
  if (toCreate.length === 0) {
    try {
      await ensureArtPrepTask(orderId);
    } catch {
      /* non-fatal */
    }
    try {
      await ensureProofApprovalTask(orderId);
    } catch {
      /* non-fatal */
    }
    return;
  }

  await db.task.createMany({
    data: toCreate.map((title) => {
      const isPrintStep =
        title.startsWith("Print ") ||
        title === "Burn Screen" ||
        title.startsWith("Press ");
      return {
        orderId,
        title,
        status:
          isPrintStep && blockPrint ? "BLOCKED" : "PENDING",
        dueDate: null,
        jobId: job.id,
        type: taskTypeForTitle(title),
      };
    }),
  });

  try {
    await ensureArtPrepTask(orderId);
  } catch {
    /* non-fatal */
  }
  try {
    await ensureProofApprovalTask(orderId);
  } catch {
    /* non-fatal */
  }
}
