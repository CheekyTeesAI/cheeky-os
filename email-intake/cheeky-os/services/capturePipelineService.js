/**
 * Bundle 3 — persist capture orders + default production tasks.
 */

const { getPrisma } = require("../marketing/prisma-client");

const DEFAULT_TASKS = ["Review Artwork", "Print", "Quality Check"];

const TASK_CLARIFY = "Clarify Order Details";
const TASK_PAYMENT = "Confirm Payment / Deposit";
const TASK_RUSH = "Rush Review";

/**
 * @param {unknown} flag
 */
function isPaymentRelatedFlag(flag) {
  const s = String(flag == null ? "" : flag).toLowerCase();
  if (!s) return false;
  return (
    s.includes("payment") ||
    s.includes("paid") ||
    s.includes("deposit") ||
    s.includes("unpaid") ||
    s === "not_paid"
  );
}

/**
 * @param {{ priority?: string, riskLevel?: string, riskFlags?: unknown[] }} [opts]
 * @returns {string[]}
 */
function buildTaskTitles(opts) {
  const o = opts || {};
  const titles = [...DEFAULT_TASKS];
  const riskLevel = String(o.riskLevel || "").toLowerCase();
  const priority = String(o.priority || "").toLowerCase();
  const riskFlags = Array.isArray(o.riskFlags) ? o.riskFlags : [];

  if (riskLevel === "high") {
    titles.push(TASK_CLARIFY);
  }
  if (riskFlags.some(isPaymentRelatedFlag)) {
    titles.push(TASK_PAYMENT);
  }
  if (priority === "critical") {
    titles.push(TASK_RUSH);
  }

  const seen = new Set();
  const out = [];
  for (const t of titles) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * @param {{ customer?: string, quantity?: number, product?: string, print?: string, due?: string }} body
 */
async function createOrderFromCapture(body) {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) {
    return {
      success: false,
      orderId: "",
      error: "Database not available — run prisma generate and migrate for cheeky-os/prisma",
    };
  }

  const customerName = String(body && body.customer != null ? body.customer : "").trim();

  const quantity = Math.max(0, Math.floor(Number(body && body.quantity) || 0));
  const product = String(body && body.product != null ? body.product : "").trim();
  const printType = String(body && body.print != null ? body.print : "").trim();
  const dueDate = String(body && body.due != null ? body.due : "").trim();

  try {
    const row = await prisma.captureOrder.create({
      data: {
        customerName,
        quantity,
        product,
        printType,
        dueDate,
        status: "INTAKE",
      },
    });
    return { success: true, orderId: row.id, error: "" };
  } catch (err) {
    console.error("[capturePipeline] createOrder:", err.message || err);
    return {
      success: false,
      orderId: "",
      error: err instanceof Error ? err.message : "create failed",
    };
  }
}

/**
 * @param {string} orderId
 * @param {{ priority?: string, riskLevel?: string, riskFlags?: unknown[] }} [opts]
 */
async function generateTasksForOrder(orderId, opts) {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureTask) {
    return {
      success: false,
      tasksCreated: 0,
      taskTitles: [],
      error: "Database not available — run prisma generate and migrate for cheeky-os/prisma",
    };
  }

  const id = String(orderId || "").trim();
  if (!id) {
    return {
      success: false,
      tasksCreated: 0,
      taskTitles: [],
      error: "orderId is required",
    };
  }

  try {
    const order = await prisma.captureOrder.findUnique({ where: { id } });
    if (!order) {
      return {
        success: false,
        tasksCreated: 0,
        taskTitles: [],
        error: "order not found",
      };
    }

    const desiredTitles = buildTaskTitles(opts);
    const existing = await prisma.captureTask.findMany({
      where: { orderId: id },
      select: { title: true },
    });
    const existingSet = new Set(
      existing.map((r) => String(r.title || "").trim())
    );
    const toCreate = desiredTitles.filter((t) => t && !existingSet.has(t));

    if (toCreate.length === 0) {
      return { success: true, tasksCreated: 0, taskTitles: [], error: "" };
    }

    await prisma.captureTask.createMany({
      data: toCreate.map((title) => ({
        orderId: id,
        title,
        status: "PENDING",
      })),
    });
    return {
      success: true,
      tasksCreated: toCreate.length,
      taskTitles: toCreate,
      error: "",
    };
  } catch (err) {
    console.error("[capturePipeline] generateTasks:", err.message || err);
    return {
      success: false,
      tasksCreated: 0,
      taskTitles: [],
      error: err instanceof Error ? err.message : "task create failed",
    };
  }
}

module.exports = {
  createOrderFromCapture,
  generateTasksForOrder,
  DEFAULT_TASKS,
  buildTaskTitles,
};
