"use strict";

const { createOrder } = require("./orderStore");
const { logEvent } = require("./eventStore");
const { generateTasksFromPaidOrder } = require("./taskEngine");

/**
 * @param {Record<string, unknown>} payload
 * @returns {"DTG"|"SCREENPRINT"|"UNKNOWN"}
 */
function deriveProductionType(payload) {
  const q = Number(payload.quantity) || 0;
  const c = Number(payload.designColors) || 0;
  if (q < 24) return "DTG";
  if (q >= 24 && c <= 4) return "SCREENPRINT";
  return "UNKNOWN";
}

/**
 * @param {{ productionType?: string }} input
 * @returns {"in_house"|"vendor"|"undecided"}
 */
function deriveRouting(input) {
  const pt = String(input.productionType || "");
  if (pt === "SCREENPRINT") return "vendor";
  if (pt === "DTG") return "in_house";
  return "undecided";
}

/**
 * @param {Record<string, unknown>} order
 * @returns {Array<Record<string, unknown>>}
 */
function createProductionTasksFromOrder(order) {
  const tasks = generateTasksFromPaidOrder(order);
  try {
    logEvent("production_tasks_created", {
      orderId: order.id,
      count: tasks.length,
    });
  } catch (_) {}
  console.log("🛠 production tasks created:", tasks.length, "for", order.id);
  return tasks;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {{ order: Record<string, unknown>; tasks: Array<Record<string, unknown>> }}
 */
function createOrderFromPayment(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  try {
    logEvent("payment_received", {
      customer: p.customer,
      estimateId: p.estimateId,
      squarePaymentId: p.squarePaymentId,
      depositPaid: p.depositPaid,
    });
  } catch (_) {}
  console.log("💵 payment received:", String(p.customer || "").slice(0, 80));

  const productionType = deriveProductionType(p);
  const routing = deriveRouting({ productionType });
  const totalAmt = Number(p.totalAmount) || 0;
  const dep = Number(p.depositPaid) || 0;
  const balanceDue = Math.max(0, totalAmt - dep);
  const now = new Date().toISOString();

  const order = createOrder({
    customer: String(p.customer || "Customer").trim() || "Customer",
    customerEmail: p.customerEmail != null ? String(p.customerEmail) : "",
    source: "square",
    estimateId: p.estimateId != null ? String(p.estimateId) : "",
    squarePaymentId: p.squarePaymentId != null ? String(p.squarePaymentId) : "",
    squareOrderId: p.squareOrderId != null ? String(p.squareOrderId) : "",
    depositPaid: dep,
    totalAmount: totalAmt,
    balanceDue,
    status: "production_ready",
    routing,
    productionType,
    quantity: Number(p.quantity) || 0,
    notes: p.notes != null ? String(p.notes) : "",
    createdAt: now,
    updatedAt: now,
  });

  if (!order) {
    throw new Error("Failed to persist order");
  }

  try {
    logEvent("order_created", { orderId: order.id, customer: order.customer });
  } catch (_) {}
  console.log("📦 order created:", order.id);

  try {
    logEvent("routing_assigned", {
      orderId: order.id,
      routing: order.routing,
      productionType: order.productionType,
    });
  } catch (_) {}
  console.log("🧭 routing assigned:", routing, productionType);

  const tasks = createProductionTasksFromOrder(order);
  return { order, tasks };
}

module.exports = {
  createOrderFromPayment,
  deriveProductionType,
  deriveRouting,
  createProductionTasksFromOrder,
};
