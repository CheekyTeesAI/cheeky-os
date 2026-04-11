/**
 * Cheeky OS — Follow-up engine. Pure logic, no Express.
 * Triggers the existing follow-up pipeline.
 *
 * @module cheeky-os/engine/followup
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

/**
 * Run the full follow-up cycle: identify unpaid → send messages.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function runFollowups() {
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";

  // Get follow-up targets
  const openUrl = base + "/cheeky/followup2/open";
  const targets = await fetchSafe(openUrl);
  if (!targets.ok) {
    logger.error(`[FOLLOWUP] open targets failed: ${openUrl} | ${targets.error}`);
    return { ok: false, data: null, error: "Failed to get followups: " + targets.error };
  }

  // Send follow-up messages
  const runUrl = base + "/cheeky/followup2/run";
  const sent = await fetchSafe(runUrl, { method: "POST" });
  if (!sent.ok) {
    logger.error(`[FOLLOWUP] run cycle failed: ${runUrl} | ${sent.error}`);
    return { ok: false, data: null, error: "Failed to send followups: " + sent.error };
  }

  const count = (sent.data && sent.data.count) || 0;
  logger.info(`[FOLLOWUP] Sent ${count} follow-up messages`);

  return {
    ok: true,
    data: {
      targets: (targets.data && targets.data.count) || 0,
      sent: count,
      results: (sent.data && sent.data.results) || [],
    },
    error: null,
  };
}

module.exports = { runFollowups };
