/**
 * Bundle 4 — capture order lifecycle + production queue slices.
 */

const { getPrisma } = require("../marketing/prisma-client");

/** Locked flow: adjacent forward transitions only. */
const ORDER_STATUSES = [
  "INTAKE",
  "QUOTE",
  "DEPOSIT",
  "READY",
  "PRINTING",
  "QC",
  "DONE",
];

const STATUS_INDEX = Object.fromEntries(
  ORDER_STATUSES.map((s, i) => [s, i])
);

const STATUS_SET = new Set(ORDER_STATUSES);

const QUEUE_STATUSES = ["READY", "PRINTING", "QC"];

const MAX_PER_GROUP = 25;

function normalizeStoredStatus(s) {
  const u = String(s || "")
    .trim()
    .toUpperCase();
  return STATUS_SET.has(u) ? u : "INTAKE";
}

function normalizeRequestedStatus(s) {
  const u = String(s || "")
    .trim()
    .toUpperCase();
  return STATUS_SET.has(u) ? u : null;
}

function canTransition(fromNorm, toNorm) {
  const i = STATUS_INDEX[fromNorm];
  const j = STATUS_INDEX[toNorm];
  if (i === undefined || j === undefined) return false;
  return j === i + 1;
}

/**
 * @param {string} orderId
 * @param {string} status
 * @returns {Promise<{ success: boolean, status: string, error?: string }>}
 */
async function updateCaptureOrderStatus(orderId, status) {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) {
    return {
      success: false,
      status: "",
      error: "Database not available",
    };
  }

  const id = String(orderId || "").trim();
  const next = normalizeRequestedStatus(status);
  if (!id) {
    return { success: false, status: "", error: "orderId is required" };
  }
  if (!next) {
    return { success: false, status: "", error: "invalid status" };
  }

  try {
    const row = await prisma.captureOrder.findUnique({ where: { id } });
    if (!row) {
      return { success: false, status: "", error: "order not found" };
    }

    const current = normalizeStoredStatus(row.status);
    if (!canTransition(current, next)) {
      return {
        success: false,
        status: "",
        error: `invalid transition ${current} → ${next}`,
      };
    }

    if (next === "READY" && !row.depositReceived) {
      return {
        success: false,
        status: "",
        error: "Cannot move to READY until deposit is received",
      };
    }

    await prisma.captureOrder.update({
      where: { id },
      data: { status: next },
    });

    return { success: true, status: next };
  } catch (err) {
    console.error("[orderStatusEngine] update:", err.message || err);
    return {
      success: false,
      status: "",
      error: err instanceof Error ? err.message : "update failed",
    };
  }
}

/** @param {Array<{ dueDate?: string, createdAt: Date }>} rows */
function sortOrdersForQueue(rows) {
  const copy = [...rows];
  copy.sort((a, b) => {
    const aHas = !!(a.dueDate && String(a.dueDate).trim());
    const bHas = !!(b.dueDate && String(b.dueDate).trim());
    if (aHas && bHas) {
      const c = String(a.dueDate).localeCompare(String(b.dueDate));
      if (c !== 0) return c;
    } else if (aHas && !bHas) return -1;
    else if (!aHas && bHas) return 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return copy;
}

/**
 * Optional memoryJson.garmentOrderStatus mirrors PostgreSQL flow for capture orders.
 * @param {{ id: string, customerName: string, product: string, quantity: number, printType: string, dueDate: string, memoryJson?: string }} row
 */
function toQueueItem(row) {
  let blockedByGarments = false;
  try {
    const m = JSON.parse(row.memoryJson || "{}");
    const g = String(m.garmentOrderStatus || "").toUpperCase();
    blockedByGarments =
      g !== "" &&
      g !== "NOT_NEEDED" &&
      g !== "RECEIVED" &&
      row.depositReceived === true;
  } catch (_) {
    blockedByGarments = false;
  }
  return {
    orderId: row.id,
    customerName: row.customerName,
    product: row.product,
    quantity: row.quantity,
    printType: row.printType,
    dueDate: row.dueDate || "",
    blockedByGarments,
  };
}

/**
 * @returns {Promise<{ ready: object[], printing: object[], qc: object[] }>}
 */
async function getProductionQueue() {
  const empty = { ready: [], printing: [], qc: [] };
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return empty;

  try {
    const [readyRows, printingRows, qcRows] = await Promise.all([
      prisma.captureOrder.findMany({
        where: { status: "READY", depositReceived: true },
      }),
      prisma.captureOrder.findMany({ where: { status: "PRINTING" } }),
      prisma.captureOrder.findMany({ where: { status: "QC" } }),
    ]);

    return {
      ready: sortOrdersForQueue(readyRows)
        .slice(0, MAX_PER_GROUP)
        .map(toQueueItem),
      printing: sortOrdersForQueue(printingRows)
        .slice(0, MAX_PER_GROUP)
        .map(toQueueItem),
      qc: sortOrdersForQueue(qcRows)
        .slice(0, MAX_PER_GROUP)
        .map(toQueueItem),
    };
  } catch (err) {
    console.error("[orderStatusEngine] queue:", err.message || err);
    return empty;
  }
}

/**
 * Bundle 7 — one SQLite read for alerts + ops panel (READY / PRINTING / QC with createdAt).
 * @returns {Promise<Array<{ id: string, status: string, customerName: string, product: string, quantity: number, printType: string, dueDate: string, createdAt: Date }>>}
 */
async function getActiveProductionOrdersForAlerts() {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];

  try {
    return await prisma.captureOrder.findMany({
      where: { status: { in: ["READY", "PRINTING", "QC"] } },
      select: {
        id: true,
        status: true,
        customerName: true,
        product: true,
        quantity: true,
        printType: true,
        dueDate: true,
        createdAt: true,
      },
    });
  } catch (err) {
    console.error("[orderStatusEngine] alerts queue:", err.message || err);
    return [];
  }
}

module.exports = {
  ORDER_STATUSES,
  QUEUE_STATUSES,
  normalizeStoredStatus,
  normalizeRequestedStatus,
  canTransition,
  updateCaptureOrderStatus,
  getProductionQueue,
  getActiveProductionOrdersForAlerts,
  toQueueItem,
  sortOrdersForQueue,
};
