"use strict";

const { runDecisionEngine } = require("./decisionEngine");
const { getDecisionMode } = require("./decisionPolicy");

function summarize(decisions) {
  const list = decisions || [];
  return {
    criticalCount: list.filter((d) => d.priority === "critical").length,
    highCount: list.filter((d) => d.priority === "high").length,
    mediumCount: list.filter((d) => d.priority === "medium").length,
    lowCount: list.filter((d) => d.priority === "low").length,
  };
}

async function getDecisionSnapshot() {
  const mode = getDecisionMode();
  const result = await runDecisionEngine();
  const decisions = result && result.success ? result.decisions : [];
  const counts = summarize(decisions);
  return {
    mode,
    totalRecommendations: decisions.length,
    criticalCount: counts.criticalCount,
    highCount: counts.highCount,
    mediumCount: counts.mediumCount,
    lowCount: counts.lowCount,
    topActions: decisions.slice(0, 10),
    blockedActions: decisions.filter((d) => d.outcome === "blocked").slice(0, 20),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getDecisionSnapshot,
};
