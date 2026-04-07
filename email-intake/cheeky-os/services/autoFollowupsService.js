/**
 * Bundle 5 — one Square pull via getRevenueFollowups, then scoring.
 */

const { getRevenueFollowups } = require("./revenueFollowups");
const {
  scoreFollowupOpportunities,
  toTopActionShape,
} = require("./followupScoringService");

/** @returns {Promise<{ topActions: object[] }>} */
async function getAutoFollowupsResponse() {
  try {
    const f = await getRevenueFollowups();
    const scored = scoreFollowupOpportunities(
      f.unpaidInvoices || [],
      f.staleEstimates || []
    );
    const topActions = scored.slice(0, 10).map(toTopActionShape);
    return { topActions };
  } catch (err) {
    console.error("[autoFollowups]", err.message || err);
    return { topActions: [] };
  }
}

module.exports = { getAutoFollowupsResponse };
