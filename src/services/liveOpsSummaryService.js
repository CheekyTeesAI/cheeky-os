/**
 * Owner-facing summary of what is actually usable today.
 */
const { validateLiveIntegrations } = require("./liveIntegrationValidator");
const { getManualFallbackMap } = require("./manualFallbackService");
const { getSystemModes } = require("./systemModeService");
const adoptionStateStore = require("./adoptionStateStore");

/**
 * @param {import("express").Application | null} app
 */
async function getLiveOpsSummary(app) {
  const v = await validateLiveIntegrations(app);
  const modes = getSystemModes();
  const st = adoptionStateStore.load();

  const whatIsLive = [];
  const whatIsPreviewOnly = [];
  const whatIsManualFallback = [];
  const ownerAttentionNeeded = [];
  const safeToUseToday = [];

  for (const s of v.subsystems || []) {
    if (!s) continue;
    const mode = String(s.mode || "");
    if (mode === "LIVE" || mode === "LIVE_CAPABLE") {
      whatIsLive.push(s.subsystem);
    }
    if (mode.includes("PREVIEW") || mode === "DRY_RUN") {
      whatIsPreviewOnly.push(s.subsystem);
    }
    if (mode === "DEGRADED" || mode === "MOCK") {
      const fb = getManualFallbackMap().find((m) =>
        String(s.subsystem || "")
          .toLowerCase()
          .includes(m.subsystem.toLowerCase().replace(/_/g, "")),
      );
      whatIsManualFallback.push(fb ? `${s.subsystem}: ${fb.manualFallback}` : `${s.subsystem}: see /go-live/readiness`);
    }
    if (s.blocking || (s.warnings && s.warnings.length)) {
      ownerAttentionNeeded.push(s.subsystem);
    }
  }

  if (modes.globalMode === "BUILD" || modes.globalMode === "TRAINING") {
    ownerAttentionNeeded.push(`globalMode=${modes.globalMode}`);
  }
  if (st.trainingMode) {
    ownerAttentionNeeded.push("trainingMode");
  }

  safeToUseToday.push("Control tower snapshot", "Command console queries", "Manual timeline / notes");
  if (whatIsLive.includes("storage")) safeToUseToday.push("Local JSON persistence");
  if (whatIsLive.includes("square_read")) safeToUseToday.push("Square-backed job money view (verify non-mock)");

  return {
    whatIsLive,
    whatIsPreviewOnly,
    whatIsManualFallback,
    ownerAttentionNeeded,
    safeToUseToday,
    globalMode: modes.globalMode,
    time: new Date().toISOString(),
  };
}

module.exports = { getLiveOpsSummary };
