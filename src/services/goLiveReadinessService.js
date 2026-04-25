/**
 * Single readiness report — combines validator + policy + recommendations.
 */
const { validateLiveIntegrations } = require("./liveIntegrationValidator");
const { evaluateCutoverPolicy } = require("./cutoverPolicyService");
const { getManualFallbackMap } = require("./manualFallbackService");
const { getSystemModes } = require("./systemModeService");
const adoptionStateStore = require("./adoptionStateStore");
const { logAdoptionEvent } = require("./adoptionEventLog");

/**
 * @param {import("express").Application | null} app
 */
async function buildGoLiveReadinessReport(app) {
  const validation = await validateLiveIntegrations(app);
  const policy = evaluateCutoverPolicy(validation);
  const modes = getSystemModes();

  const blockers = policy.criticalBlockers.slice();
  const warnings = policy.nonCriticalWarnings.slice();

  if (modes.trainingMode && modes.globalMode === "LIVE") {
    warnings.push("trainingMode is still enabled — disable before trusting LIVE ops.");
  }
  if (Number(adoptionStateStore.load().demoSeedVersion || 0) > 0) {
    warnings.push("Demo data present — clear when operating real orders.");
  }

  let score = 100;
  score -= blockers.length * 18;
  score -= warnings.length * 4;
  score = Math.max(0, Math.min(100, score));

  const ready = policy.canEnterLiveMode && score >= 55;

  const recommendedNextSteps = [];
  if (blockers.some((b) => b.includes("square"))) recommendedNextSteps.push("Configure SQUARE_ACCESS_TOKEN and verify non-mock invoice read.");
  if (blockers.some((b) => b.includes("storage"))) recommendedNextSteps.push("Fix data/ and uploads/ directory permissions.");
  if (blockers.some((b) => b.includes("database"))) recommendedNextSteps.push("Run prisma generate/migrate for foundation DB.");
  if (!validation.routesProbe) recommendedNextSteps.push("Verify go-live and control-tower routes are mounted on this process.");

  const manualFallbacks = getManualFallbackMap().filter((m) =>
    warnings.some((w) => w.toLowerCase().includes(m.subsystem.toLowerCase())),
  );

  adoptionStateStore.save({ lastGoLiveReadinessAt: new Date().toISOString() });
  logAdoptionEvent("go_live_readiness_generated", { ready, score: Math.round(score) });

  return {
    ready,
    score: Math.round(score),
    blockers,
    warnings,
    subsystemReadiness: validation.subsystems,
    recommendedNextSteps,
    manualFallbacks: manualFallbacks.length ? manualFallbacks : getManualFallbackMap().slice(0, 3),
    modes,
    time: new Date().toISOString(),
  };
}

module.exports = { buildGoLiveReadinessReport };
