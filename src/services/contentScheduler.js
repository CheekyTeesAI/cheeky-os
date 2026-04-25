/**
 * Back-compat — delegates to content orchestrator.
 */
const { getTodayContent, forceGenerateToday } = require("./contentOrchestrator");

function getOrGenerateTodayPost() {
  return getTodayContent();
}

function forceGenerateTodayPost() {
  return forceGenerateToday();
}

module.exports = {
  getOrGenerateTodayPost,
  forceGenerateTodayPost,
};
