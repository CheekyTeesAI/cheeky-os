"use strict";

/**
 * PHASE 1 — Snapshot Engine
 * Aggregates Square metrics + Order metrics + Alerts into one business snapshot.
 *
 * FAIL SAFE: Each sub-service is wrapped in try/catch.
 *            buildSnapshot() never throws — always returns a valid object.
 * NO AUTO-SEND. READ ONLY.
 */

const squareMetrics = require("./square.metrics.service");
const orderMetrics  = require("./order.metrics.service");
const alertEngine   = require("./alert.engine");

/**
 * Build the full business snapshot.
 * Async — pulls live data from Square + DB.
 *
 * @returns {Promise<object>}
 */
async function buildSnapshot() {
  const base = {
    revenueToday: 0,
    revenue7DayAvg: 0,
    openOrders: 0,
    ordersInProduction: 0,
    overdueOrders: 0,
    newOrdersLast24h: 0,
    unpaidInvoices: 0,
    cashOnHand: 0,
    upcomingExpenses: [],
    alerts: [],
    generatedAt: new Date().toISOString(),
  };

  // Pull Square + Order data in parallel — each fails independently
  const [squareData, orderData] = await Promise.all([
    squareMetrics.getMetrics().catch((err) => {
      console.warn("[snapshot] square metrics failed:", err && err.message ? err.message : err);
      return {};
    }),
    orderMetrics.getMetrics().catch((err) => {
      console.warn("[snapshot] order metrics failed:", err && err.message ? err.message : err);
      return {};
    }),
  ]);

  const snapshot = {
    ...base,
    ...squareData,
    ...orderData,
    generatedAt: new Date().toISOString(),
  };

  // Generate alerts from populated snapshot (+ optional alertsService / kpiService)
  try {
    snapshot.alerts = await alertEngine.generateAlerts(snapshot);
  } catch (err) {
    console.warn("[snapshot] alert merge failed:", err && err.message ? err.message : err);
    snapshot.alerts = [];
  }

  return snapshot;
}

module.exports = { buildSnapshot };
