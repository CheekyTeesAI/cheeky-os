/**
 * Bundle 48 — in-memory recent inbound leads (process lifetime only).
 */

const MAX_LEADS = 50;

/** @type {object[]} */
const queue = [];

/**
 * @param {object} lead normalized lead + optional capturedAt
 */
function pushLead(lead) {
  if (!lead || typeof lead !== "object") return;
  const row = { ...lead };
  if (!row.capturedAt) row.capturedAt = new Date().toISOString();
  queue.unshift(row);
  if (queue.length > MAX_LEADS) {
    queue.length = MAX_LEADS;
  }
}

/**
 * @param {number} [limit]
 * @returns {object[]}
 */
function getRecentLeads(limit) {
  const n = Math.min(50, Math.max(1, Math.floor(Number(limit) || MAX_LEADS)));
  return queue.slice(0, n).map((r) => ({ ...r }));
}

module.exports = {
  pushLead,
  getRecentLeads,
  MAX_LEADS,
};
