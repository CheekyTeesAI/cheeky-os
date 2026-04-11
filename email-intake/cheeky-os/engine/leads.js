/**
 * Cheeky OS — Leads/outreach engine. Pure logic, no Express.
 * Identifies orders needing outreach and generates contact lists.
 *
 * @module cheeky-os/engine/leads
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

/**
 * Run outreach — find orders with no deposit and generate contact list.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function runOutreach() {
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  const url = base + "/cheeky/data/deals/open";
  const result = await fetchSafe(url);

  if (!result.ok) {
    logger.error(`[LEADS] fetch failed: ${url} | ${result.error}`);
    return { ok: false, data: null, error: "Failed to fetch orders: " + result.error };
  }
  const deals = result.data?.data?.records || result.data?.records || [];

  // Leads = orders with no deposit paid and still in early stages
  const leads = deals.filter((o) => {
    const deposit = o.deposit_paid || o.deposit || 0;
    const stage = (o.production_status || o.stage || "").toLowerCase();
    return deposit === 0 && (stage === "pending" || stage === "received" || stage === "");
  });

  const contactList = leads.map((o) => ({
    customer: o.customer_name || "(unknown)",
    email: o.email || null,
    total: o.order_total || 0,
    stage: o.production_status || "Unknown",
    days_old: o.created_on
      ? Math.floor((Date.now() - new Date(o.created_on).getTime()) / 86400000)
      : null,
  }));

  logger.info(`[LEADS] Found ${contactList.length} outreach targets`);

  return {
    ok: true,
    data: {
      count: contactList.length,
      leads: contactList,
    },
    error: null,
  };
}

module.exports = { runOutreach };
