/**
 * Bundle 18 — founder copilot copy (pure composition; no DB or AI here).
 */

const { getDailySummary } = require("./dailySummaryService");
const { collectAutomationActions } = require("./automationActionsService");
const { getAutoFollowupsResponse } = require("./autoFollowupsService");

/**
 * @returns {{ message: string, topActions: object[], alerts: string[], suggestions: string[] }}
 */
function fallbackCopilot() {
  return {
    message:
      "Check your dashboard: work urgent follow-ups first, clear payment blockers, then push ready jobs to print.",
    topActions: [],
    alerts: [],
    suggestions: [],
  };
}

/**
 * @param {unknown} row
 * @param {{ biggestOpportunity?: string, topCustomer?: string, topAction?: string }} [highlights]
 */
function startLineFromAction(row, highlights) {
  const h = highlights || {};
  if (row && typeof row === "object") {
    const cn = String(row.customerName || "").trim();
    const rs = String(row.reason || "").trim();
    if (cn && rs) return `Start with ${cn} — ${rs}.`;
    if (cn) return `Start with ${cn}.`;
    if (rs) return `Start with ${rs}.`;
  }
  const opp = String(h.biggestOpportunity || "").trim();
  if (opp) return `Start with ${opp}.`;
  const tc = String(h.topCustomer || "").trim();
  const ta = String(h.topAction || "").trim();
  if (tc && ta) return `Start with ${tc} — ${ta}.`;
  if (ta) return `Start with ${ta}.`;
  return "Start with your top system action below.";
}

/**
 * @param {{
 *   summary?: { counts?: object, highlights?: object },
 *   automationActions?: object[],
 *   followups?: object[],
 * }} input
 * @returns {{ message: string, topActions: object[], alerts: string[], suggestions: string[] }}
 */
function buildCopilotGuidance(input) {
  const summary = input && input.summary && typeof input.summary === "object"
    ? input.summary
    : {};
  const counts = summary.counts && typeof summary.counts === "object"
    ? summary.counts
    : {};
  const highlights =
    summary.highlights && typeof summary.highlights === "object"
      ? summary.highlights
      : {};

  const actions = Array.isArray(input.automationActions)
    ? input.automationActions
    : [];
  const followList = Array.isArray(input.followups) ? input.followups : [];

  const urgent = Number(counts.urgentFollowups) || 0;
  const x =
    followList.length > 0 ? followList.length : urgent;
  const y = Number(counts.readyToPrint) || 0;
  const z = Number(counts.blockedOrders) || 0;
  const highRisk = Number(counts.highRiskOrders) || 0;
  const inProd = Number(counts.inProduction) || 0;

  const lines = [];
  lines.push(
    `You have ${x} follow-ups, ${y} jobs ready to print, and ${z} blockers.`
  );
  lines.push(startLineFromAction(actions[0], highlights));

  if (z > 0 || highRisk > 0) {
    const bits = [];
    if (z > 0) {
      bits.push(
        `${z} job${z === 1 ? "" : "s"} blocked by payment`
      );
    }
    if (highRisk > 0) {
      bits.push(
        `${highRisk} high-risk job${highRisk === 1 ? "" : "s"}`
      );
    }
    lines.push(`Watch out for ${bits.join(" and ")}.`);
  }

  if (y > 0) {
    lines.push(
      `You can also move ${y} job${y === 1 ? "" : "s"} into printing.`
    );
  } else if (inProd > 0 && lines.length < 4) {
    lines.push(
      `${inProd} job${inProd === 1 ? "" : "s"} already in production — keep the floor moving.`
    );
  }

  const message = lines.slice(0, 4).join("\n");

  const topActions = actions.slice(0, 3).map((a) => {
    if (!a || typeof a !== "object") return { label: "", customerName: "", type: "" };
    return {
      label: String(a.label || "").trim(),
      customerName: String(a.customerName || "").trim(),
      type: String(a.type || "").trim(),
      reason: String(a.reason || "").trim(),
    };
  });

  const alerts = [];
  if (z > 0) alerts.push(`${z} payment blocker(s)`);
  if (highRisk > 0) alerts.push(`${highRisk} high-risk job(s)`);

  const suggestions = [];
  if (y > 0) suggestions.push(`Move ${y} ready job(s) to printing`);
  if (urgent > 0) suggestions.push(`Close or schedule ${urgent} urgent follow-up(s)`);
  if (inProd > 0) suggestions.push(`Check in on ${inProd} job(s) in production`);

  return {
    message,
    topActions,
    alerts,
    suggestions,
  };
}

/**
 * Loads summary + automation + follow-ups and composes copilot output.
 * @returns {Promise<{ message: string, topActions: object[], alerts: string[], suggestions: string[] }>}
 */
async function getCopilotTodayPayload() {
  try {
    const [summary, autoPack, auto] = await Promise.all([
      getDailySummary(),
      collectAutomationActions(10),
      getAutoFollowupsResponse(),
    ]);
    return buildCopilotGuidance({
      summary,
      automationActions: (autoPack && autoPack.actions) || [],
      followups: (auto && auto.topActions) || [],
    });
  } catch (err) {
    console.error("[copilot]", err.message || err);
    return fallbackCopilot();
  }
}

module.exports = {
  buildCopilotGuidance,
  getCopilotTodayPayload,
  fallbackCopilot,
};
