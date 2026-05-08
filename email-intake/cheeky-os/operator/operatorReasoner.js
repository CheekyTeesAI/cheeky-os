"use strict";

/**
 * Aggregates operational context for NL answers (read-only).
 */
function gatherOperationalReasoning(operatorIntent, queryText, options) {
  try {
    const opts = options && typeof options === "object" ? options : {};

    /** @type {object[]} */
    const sources = [];

    /** @type {object[]} */
    const recommendations = [];
    try {
      const { generateRecommendations } = require("../intelligence/recommendationEngine");
      const r = generateRecommendations();
      sources.push({ type: "recommendations_engine", count: r.length });
      recommendations.push(...r.slice(0, 12));
    } catch (_e2) {}

    /** @type {object[]} */
    const priorities = [];
    try {
      const { computeOperationalPriorities } = require("../intelligence/priorityEngine");
      priorities.push(...computeOperationalPriorities(16));
      sources.push({ type: "priority_engine", count: priorities.length });
    } catch (_e3) {}

    /** @type {object | null} */
    let dash = null;
    try {
      const { buildOperationalSnapshot } = require("../dashboard/dashboardAggregator");
      dash = buildOperationalSnapshot();
      sources.push({ type: "dashboard_snapshot", generatedAt: dash && dash.generatedAt });
    } catch (_e4) {}

    /** @type {object[]} */
    const pendingApprovals = [];
    try {
      const ae = require("../workflow/approvalEngine");
      pendingApprovals.push(...ae.getPendingApprovals().slice(0, 20));
      sources.push({ type: "approvals", pending: pendingApprovals.length });
    } catch (_e5) {}

    /** @type {object} */
    let relatedMemory = null;
    if (opts.includeMemory !== false && String(operatorIntent || "") === "memory_retrieval") {
      try {
        const sem = require("../memory/semanticTaskEngine");
        const stub = {
          intent: "query",
          target: String(queryText || "").slice(0, 260),
          requirements: [],
        };
        relatedMemory = sem.findRelatedTasks(stub, 6);
        sources.push({ type: "semantic_memory", ok: !!(relatedMemory && relatedMemory.success) });
      } catch (_e6) {
        relatedMemory = { success: false, related: [] };
      }
    }

    /** @type {object | null} */
    let continuity = null;
    try {
      const oce = require("../memory/operationalContinuityEngine");
      continuity = oce.getContinuitySnapshot();
      sources.push({ type: "operational_continuity" });
    } catch (_e7) {}

    /** @type {string[]} */
    const riskSummaries = [];
    try {
      if (dash && Array.isArray(dash.alerts)) {
        for (let i = 0; i < Math.min(8, dash.alerts.length); i++) {
          const a = dash.alerts[i];
          if (a && a.description) riskSummaries.push(String(a.description));
          else if (a && a.code) riskSummaries.push(String(a.code));
        }
      }
    } catch (_e8) {}

    /** @type {object[]} */
    const prioritizedActions = [];
    try {
      for (let i = 0; i < Math.min(5, priorities.length); i++) {
        const p = priorities[i];
        prioritizedActions.push({
          title: p.title,
          action: p.recommendedAction,
          severity: p.severity,
        });
      }
    } catch (_e9) {}

    try {
      for (let i = 0; i < Math.min(4, recommendations.length); i++) {
        const r = recommendations[i];
        if (r && r.suggestedAction)
          prioritizedActions.push({ title: r.title, action: r.suggestedAction, severity: r.severity });
      }
    } catch (_e10) {}

    /** @type {string} */
    let operationalReasoning = "";
    try {
      operationalReasoning =
        `Intent ${operatorIntent}: ${prioritizedActions.length} high-leverage actions surfaced; ` +
        `${pendingApprovals.length} approvals pending; ` +
        `${riskSummaries.length} risk signals from dashboard tail.`;
    } catch (_e11) {
      operationalReasoning = "Operational reasoning unavailable.";
    }

    /** @type {object[]} */
    const focusRecommendations = priorities.slice(0, 3).map((p) => ({
      priorityId: p.priorityId,
      title: p.title,
      recommendedAction: p.recommendedAction,
      severity: p.severity,
    }));

    return {
      operationalReasoning,
      prioritizedActions,
      riskSummaries,
      focusRecommendations,
      recommendations,
      priorities,
      dashboard: dash,
      pendingApprovals,
      relatedMemory,
      continuity,
      sources,
      graphNote: opts.graphNote || "Operational graph updates are advisory-only in v6 Jarvis layer",
    };
  } catch (_e) {
    return {
      operationalReasoning: "Reasoner failed closed (no operational data guaranteed).",
      prioritizedActions: [],
      riskSummaries: [],
      focusRecommendations: [],
      recommendations: [],
      priorities: [],
      dashboard: null,
      pendingApprovals: [],
      relatedMemory: null,
      continuity: null,
      sources: [],
      graphNote: "",
    };
  }
}

module.exports = { gatherOperationalReasoning };
