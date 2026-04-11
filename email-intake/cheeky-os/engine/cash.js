/**
 * Cheeky OS — Cash summary engine. Pure logic, no Express.
 * Aggregates revenue, deposits, and outstanding balances.
 *
 * @module cheeky-os/engine/cash
 */

const { fetchSafeWithRetry } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

function emptyCashData() {
  return {
    total_orders: 0,
    revenue: 0,
    deposits_collected: 0,
    outstanding: 0,
    paid_orders: 0,
    unpaid_orders: 0,
    collection_rate: 0,
    orders: [],
  };
}

/**
 * Get a full cash/revenue summary from the orders export.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function getCashSummary() {
  try {
    const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
    const url = base + "/cheeky/data/snapshot";
    const result = await fetchSafeWithRetry(url, {}, { maxAttempts: 3, initialDelayMs: 250 });

    if (!result.ok || result.data == null) {
      logger.warn(`[CASH] Empty or failed response from ${url}: ${result?.error || "safe fallback"}`);
      return { ok: true, data: emptyCashData(), error: null };
    }

    const snapshot = result?.data?.data ?? result?.data ?? {};
    const orders = Array.isArray(snapshot?.orders) ? snapshot.orders : [];

    let totalRevenue = 0;
    let totalDeposits = 0;
    let unpaidCount = 0;
    let paidCount = 0;

    for (const o of orders) {
      totalRevenue += o.order_total || 0;
      totalDeposits += o.deposit_paid || 0;
      if (!o.deposit_paid || o.deposit_paid === 0) {
        unpaidCount++;
      } else {
        paidCount++;
      }
    }

    return {
      ok: true,
      data: {
        total_orders: orders.length,
        revenue: Math.round(totalRevenue * 100) / 100,
        deposits_collected: Math.round(totalDeposits * 100) / 100,
        outstanding: Math.round((totalRevenue - totalDeposits) * 100) / 100,
        paid_orders: paidCount,
        unpaid_orders: unpaidCount,
        collection_rate: orders.length > 0 ? Math.round((paidCount / orders.length) * 100) : 0,
        orders,
      },
      error: null,
    };
  } catch (err) {
    logger.warn(`[CASH] getCashSummary: ${err.message}`);
    return { ok: true, data: emptyCashData(), error: null };
  }
}

/**
 * Unpaid / open deals for cash follow-up views.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function getUnpaidDeals() {
  try {
    const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
    const url = base + "/cheeky/data/deals/open";

    const result = await fetchSafeWithRetry(url, {}, { maxAttempts: 3, initialDelayMs: 250 });

    if (!result.ok || result.data == null) {
      logger.warn(`[CASH] Empty or failed response from ${url}: ${result?.error || "safe fallback"}`);
      return { ok: true, data: { orders: [], count: 0, records: [] }, error: null };
    }

    const payload = result?.data?.data !== undefined ? result.data.data : result?.data;
    const records = Array.isArray(payload?.records)
      ? payload.records
      : Array.isArray(payload)
        ? payload
        : [];

    return {
      ok: true,
      data: {
        count: records.length,
        records,
        orders: records,
      },
      error: null,
    };
  } catch (err) {
    logger.warn(`[CASH] getUnpaidDeals: ${err.message}`);
    return { ok: true, data: { orders: [], count: 0, records: [] }, error: null };
  }
}

module.exports = { getCashSummary, getUnpaidDeals };
