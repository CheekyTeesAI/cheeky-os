"use strict";

/**
 * Executive briefings (read-only narrative; no outbound comms).
 * @param {'daily'|'weekly'} mode
 */
function buildExecutiveBriefing(mode) {
  try {
    const m = String(mode || "daily").toLowerCase() === "weekly" ? "weekly" : "daily";
    /** @type {object[]} */
    const sections = [];

    let dash = null;
    try {
      const { buildOperationalSnapshot } = require("../dashboard/dashboardAggregator");
      dash = buildOperationalSnapshot();
    } catch (_e0) {}

    /** @type {object[]} */
    let priorities = [];
    try {
      const { computeOperationalPriorities } = require("./priorityEngine");
      priorities = computeOperationalPriorities(12);
    } catch (_e1) {}

    /** @type {object[]} */
    let recs = [];
    try {
      const { generateRecommendations } = require("./recommendationEngine");
      recs = generateRecommendations().slice(0, 10);
    } catch (_e2) {}

    try {
      sections.push({
        title: m === "weekly" ? "Weekly revenue & cash snapshot" : "Daily revenue & cash snapshot",
        detail: dash && dash.revenue ? dash.revenue : {},
      });
    } catch (_e3) {}

    try {
      sections.push({
        title: "Operational risks",
        detail: {
          alerts: (dash && dash.alerts) || [],
          production: (dash && dash.production) || {},
        },
      });
    } catch (_e4) {}

    try {
      sections.push({
        title: "Top priorities",
        detail: priorities,
      });
    } catch (_e5) {}

    try {
      sections.push({
        title: "Strategic opportunities (recommendations)",
        detail: recs,
      });
    } catch (_e6) {}

    try {
      const oce = require("../memory/operationalContinuityEngine");
      sections.push({
        title: "Continuity context",
        detail: oce.getContinuitySnapshot(),
      });
    } catch (_e7) {}

    /** @type {string} */
    let narrative = "";
    try {
      const top = priorities[0];
      narrative =
        (m === "weekly" ? "Weekly" : "Daily") +
        ` briefing: ${top ? top.title : "Priorities loading"} — ` +
        `${(dash && dash.revenue && dash.revenue.unpaidInvoices && dash.revenue.unpaidInvoices.unpaidCount) || 0} unpaid invoice rows in local snapshot; ` +
        `${(dash && dash.approvals && dash.approvals.pendingCount) || 0} approvals pending. ` +
        `Human decisions required for financial, comms, and production mutations.`;
    } catch (_e8) {
      narrative = "Executive briefing narrative unavailable.";
    }

    return {
      mode: m,
      generatedAt: new Date().toISOString(),
      narrative,
      sections,
    };
  } catch (_e) {
    return {
      mode: String(mode || "daily"),
      generatedAt: new Date().toISOString(),
      narrative: "Briefing failed closed.",
      sections: [],
    };
  }
}

module.exports = { buildExecutiveBriefing };
