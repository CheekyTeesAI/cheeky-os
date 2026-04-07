/**
 * Bundle 19 — one-shot system awareness snapshot (reuses summary, actions, copilot composition).
 */

const { getDailySummary } = require("./dailySummaryService");
const { collectAutomationActions } = require("./automationActionsService");
const { getAutoFollowupsResponse } = require("./autoFollowupsService");
const {
  buildCopilotGuidance,
  fallbackCopilot,
} = require("./copilotService");

/**
 * @returns {Promise<{
 *   timestamp: string,
 *   summary: object,
 *   actions: object[],
 *   alerts: string[],
 *   copilotMessage: string
 * }>}
 */
async function runSystemCheck() {
  try {
    const [summary, autoPack, auto] = await Promise.all([
      getDailySummary(),
      collectAutomationActions(10),
      getAutoFollowupsResponse(),
    ]);

    const actions = (autoPack && autoPack.actions) || [];
    const followups = (auto && auto.topActions) || [];
    const copilot = buildCopilotGuidance({
      summary,
      automationActions: actions,
      followups,
    });
    const timestamp = new Date().toISOString();

    return {
      timestamp,
      summary: summary || { counts: {}, highlights: {} },
      actions,
      alerts: Array.isArray(copilot.alerts) ? copilot.alerts : [],
      copilotMessage: String(copilot.message || ""),
    };
  } catch (err) {
    console.error("[systemCheck]", err.message || err);
    const fb = fallbackCopilot();
    return {
      timestamp: new Date().toISOString(),
      summary: { counts: {}, highlights: {} },
      actions: [],
      alerts: Array.isArray(fb.alerts) ? fb.alerts : [],
      copilotMessage:
        fb.message ||
        "System check did not complete — verify services and try again.",
    };
  }
}

module.exports = { runSystemCheck };
