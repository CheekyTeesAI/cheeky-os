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
const { addAlert, getActiveAlerts } = require("./alertStoreService");

/** Last completed check’s active alert count (for shouldNotify). */
let lastRunActiveAlertCount = 0;

/**
 * @param {{ counts?: object }} summary
 */
function persistAlertsFromSummary(summary) {
  const c =
    summary && summary.counts && typeof summary.counts === "object"
      ? summary.counts
      : {};
  const urgent = Number(c.urgentFollowups) || 0;
  const blocked = Number(c.blockedOrders) || 0;
  const highRisk = Number(c.highRiskOrders) || 0;
  const ready = Number(c.readyToPrint) || 0;

  if (urgent > 0) {
    addAlert({
      type: "followup",
      message: `You have ${urgent} urgent follow-ups`,
      severity: "high",
    });
  }
  if (blocked > 0) {
    addAlert({
      type: "payment",
      message: `${blocked} orders blocked by payment`,
      severity: "critical",
    });
  }
  if (highRisk > 0) {
    addAlert({
      type: "risk",
      message: `${highRisk} high-risk jobs need review`,
      severity: "high",
    });
  }
  if (ready > 0) {
    addAlert({
      type: "production",
      message: `${ready} jobs ready but not printing`,
      severity: "medium",
    });
  }
}

/**
 * @returns {Promise<{
 *   timestamp: string,
 *   summary: object,
 *   actions: object[],
 *   alerts: string[],
 *   copilotMessage: string,
 *   storedAlerts: object[],
 *   shouldNotify: boolean
 * }>}
 */
async function runSystemCheck() {
  const beforeCount = lastRunActiveAlertCount;
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

    const summarySafe = summary || { counts: {}, highlights: {} };
    persistAlertsFromSummary(summarySafe);

    const stored = getActiveAlerts();
    const activeCount = stored.length;
    const shouldNotify = activeCount > 0 && activeCount > beforeCount;
    lastRunActiveAlertCount = activeCount;

    return {
      timestamp,
      summary: summarySafe,
      actions,
      alerts: Array.isArray(copilot.alerts) ? copilot.alerts : [],
      copilotMessage: String(copilot.message || ""),
      storedAlerts: stored,
      shouldNotify,
    };
  } catch (err) {
    console.error("[systemCheck]", err.message || err);
    const fb = fallbackCopilot();
    const stored = getActiveAlerts();
    const activeCount = stored.length;
    const shouldNotify = activeCount > 0 && activeCount > beforeCount;
    lastRunActiveAlertCount = activeCount;
    return {
      timestamp: new Date().toISOString(),
      summary: { counts: {}, highlights: {} },
      actions: [],
      alerts: Array.isArray(fb.alerts) ? fb.alerts : [],
      copilotMessage:
        fb.message ||
        "System check did not complete — verify services and try again.",
      storedAlerts: stored,
      shouldNotify,
    };
  }
}

module.exports = { runSystemCheck };
