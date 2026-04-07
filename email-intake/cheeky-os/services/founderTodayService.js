/**
 * Bundle 11 — assemble data for GET /founder/today (reads DB + existing services).
 */

const { getNextAction } = require("./nextAction");
const { getAutoFollowupsResponse } = require("./autoFollowupsService");
const { getProductionQueue } = require("./orderStatusEngine");
const { getPrisma } = require("../marketing/prisma-client");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("./paymentGateService");

async function fetchCaptureOrders() {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];
  try {
    return await prisma.captureOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    });
  } catch (err) {
    console.error("[founderToday] orders:", err.message || err);
    return [];
  }
}

/**
 * @returns {Promise<{
 *   next: object,
 *   paymentBlockers: object[],
 *   urgentFollowups: object[],
 *   readyForProduction: object[],
 *   highRisk: object[],
 *   queue: { ready: object[], printing: object[], qc: object[] }
 * }>}
 */
async function getFounderDashboardPayload() {
  const [next, auto, queue, orders] = await Promise.all([
    getNextAction(),
    getAutoFollowupsResponse(),
    getProductionQueue(),
    fetchCaptureOrders(),
  ]);

  const paymentBlockers = [];
  const readyForProduction = [];
  const highRisk = [];

  for (const o of orders) {
    const gate = evaluatePaymentGate(captureOrderToGateInput(o));
    const st = String(o.status || "")
      .trim()
      .toUpperCase();

    if (!gate.allowedToProduce && st !== "DONE") {
      paymentBlockers.push({
        orderId: o.id,
        customerName: o.customerName,
        product: o.product,
        quantity: o.quantity,
        status: st,
        gateReason: gate.reason,
        gateStatus: gate.gateStatus,
      });
    }

    if (gate.allowedToProduce && st === "READY") {
      readyForProduction.push({
        customerName: o.customerName,
        product: o.product,
        quantity: o.quantity,
        printType: o.printType,
        dueDate: o.dueDate || "",
      });
    }

    if (
      ["INTAKE", "QUOTE", "DEPOSIT"].includes(st) &&
      !gate.allowedToProduce
    ) {
      highRisk.push({
        customerName: o.customerName,
        product: o.product,
        quantity: o.quantity,
        status: st,
        hint: gate.reason || "Needs clarification or payment",
      });
    }
  }

  const urgentFollowups = (auto.topActions || [])
    .filter(
      (t) =>
        String(t.priority || "").toLowerCase() === "high" ||
        String(t.priority || "").toLowerCase() === "critical"
    )
    .slice(0, 5);

  return {
    next,
    paymentBlockers,
    urgentFollowups,
    readyForProduction,
    highRisk: highRisk.slice(0, 12),
    queue,
  };
}

module.exports = { getFounderDashboardPayload };
