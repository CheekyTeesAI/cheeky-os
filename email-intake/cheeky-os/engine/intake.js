/**
 * Cheeky OS — Intake engine. Pure logic, no Express.
 * Normalizes and classifies incoming order data.
 *
 * @module cheeky-os/engine/intake
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

/**
 * Process an incoming order through normalization and classification.
 * Proxies to the existing auto-order endpoint, then optionally creates in Dataverse.
 * @param {{ customer_name: string, email?: string, order_total?: number, deposit_paid?: number, notes?: string }} order
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function processIntake(order) {
  if (!order || !order.customer_name) {
    return { ok: false, data: null, error: "Missing customer_name" };
  }

  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";

  // Step 1 — Normalize via auto-order
  const normalized = await fetchSafe(base + "/api/intake/auto-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });

  if (!normalized.ok) {
    return { ok: false, data: null, error: "Normalization failed: " + normalized.error };
  }

  const orderData = normalized.data && normalized.data.order;
  if (!orderData) {
    return { ok: false, data: null, error: "No order returned from normalization" };
  }

  // Step 2 — Create in Dataverse
  const created = await fetchSafe(base + "/api/intake/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData),
  });

  if (!created.ok) {
    logger.warn("[INTAKE] Order normalized but Dataverse create failed: " + created.error);
    return { ok: true, data: { normalized: orderData, created: false, error: created.error }, error: null };
  }

  logger.info(`[INTAKE] Order created for ${order.customer_name}`);
  return { ok: true, data: { normalized: orderData, created: true, record: created.data }, error: null };
}

module.exports = { processIntake };
