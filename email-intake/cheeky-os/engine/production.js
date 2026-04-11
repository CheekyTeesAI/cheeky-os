/**
 * Cheeky OS — Production queue engine. Pure logic, no Express.
 * Fetches and prioritizes the production task list.
 *
 * @module cheeky-os/engine/production
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

/**
 * Get the prioritized production queue.
 * Proxies to existing /api/production/tasks endpoint.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function getProductionQueue() {
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  const url = base + "/cheeky/data/events";
  const result = await fetchSafe(url);

  if (!result.ok) {
    logger.error(`[PRODUCTION] fetch failed: ${url} | ${result.error}`);
    return { ok: false, data: null, error: "Failed to get production queue: " + result.error };
  }

  return {
    ok: true,
    data: result.data,
    error: null,
  };
}

module.exports = { getProductionQueue };
