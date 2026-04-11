"use strict";

const { ensureDataFiles, readJson, writeJson } = require("./dataStore");

const FILE = "orders.json";

/**
 * @returns {Array<Record<string, unknown>>}
 */
function getOrders() {
  try {
    ensureDataFiles();
    const arr = readJson(FILE, []);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list) {
  writeJson(FILE, list);
}

/**
 * @param {Record<string, unknown>} order
 */
function createOrder(order) {
  try {
    const list = getOrders();
    const now = new Date().toISOString();
    const o = order && typeof order === "object" ? order : {};
    const row = {
      ...o,
      id: String(o.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      customer: String(o.customer != null ? o.customer : "Customer"),
      customerEmail: o.customerEmail != null ? String(o.customerEmail) : "",
      source: String(o.source || "manual"),
      estimateId: o.estimateId != null ? String(o.estimateId) : "",
      squarePaymentId: o.squarePaymentId != null ? String(o.squarePaymentId) : "",
      squareOrderId: o.squareOrderId != null ? String(o.squareOrderId) : "",
      depositPaid: Number(o.depositPaid) || 0,
      totalAmount: Number(o.totalAmount) || 0,
      balanceDue: Number(o.balanceDue) || 0,
      status: String(o.status || "new"),
      routing: String(o.routing || "undecided"),
      productionType: String(o.productionType || "UNKNOWN"),
      quantity: Number(o.quantity) || 0,
      notes: o.notes != null ? String(o.notes) : "",
      createdAt: String(o.createdAt || now),
      updatedAt: String(o.updatedAt || now),
    };
    list.push(row);
    persist(list);
    return row;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[orderStore] createOrder:", e.message);
    return null;
  }
}

/**
 * @param {string} id
 */
function getOrderById(id) {
  const list = getOrders();
  return list.find((x) => String(x.id) === String(id)) || null;
}

/**
 * @param {string} id
 * @param {string} status
 */
function updateOrderStatus(id, status) {
  try {
    const list = getOrders();
    const o = list.find((x) => String(x.id) === String(id));
    if (!o) return null;
    o.status = String(status || "new");
    o.updatedAt = new Date().toISOString();
    persist(list);
    return o;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} routing
 */
function updateOrderRouting(id, routing) {
  try {
    const list = getOrders();
    const o = list.find((x) => String(x.id) === String(id));
    if (!o) return null;
    o.routing = String(routing || "undecided");
    o.updatedAt = new Date().toISOString();
    persist(list);
    return o;
  } catch {
    return null;
  }
}

/**
 * @param {string} orderId
 * @param {string} estimateId
 */
function attachEstimateToOrder(orderId, estimateId) {
  try {
    const list = getOrders();
    const o = list.find((x) => String(x.id) === String(orderId));
    if (!o) return null;
    o.estimateId = String(estimateId || "");
    o.updatedAt = new Date().toISOString();
    persist(list);
    return o;
  } catch {
    return null;
  }
}

/**
 * @returns {Record<string, unknown>}
 */
function getOrderMetrics() {
  const list = getOrders();
  const byStatus = {};
  const byRouting = {};
  const byProductionType = {};
  let totalDeposits = 0;
  let totalBalanceDue = 0;
  for (const o of list) {
    const st = String(o.status || "unknown");
    const rt = String(o.routing || "unknown");
    const pt = String(o.productionType || "unknown");
    byStatus[st] = (byStatus[st] || 0) + 1;
    byRouting[rt] = (byRouting[rt] || 0) + 1;
    byProductionType[pt] = (byProductionType[pt] || 0) + 1;
    totalDeposits += Number(o.depositPaid) || 0;
    totalBalanceDue += Number(o.balanceDue) || 0;
  }
  return {
    totalOrders: list.length,
    byStatus,
    byRouting,
    byProductionType,
    totalDeposits,
    totalBalanceDue,
  };
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  updateOrderRouting,
  attachEstimateToOrder,
  getOrderMetrics,
};
