/**
 * Training mode flag — informational + gating hint for UIs; does not replace business rules.
 */
const adoptionStateStore = require("./adoptionStateStore");
const { logAdoptionEvent } = require("./adoptionEventLog");
const { setServiceDeskFlags, getServiceDeskFlags } = require("./serviceDeskService");

function getTrainingModeStatus() {
  const st = adoptionStateStore.load();
  const enabled = !!st.trainingMode;
  const effects = [];
  if (enabled) {
    effects.push("Prefer preview/draft for outbound communications and vendor sends.");
    effects.push("Use demo data (isDemo) for practice — clear when finished.");
    try {
      const f = getServiceDeskFlags();
      if (f.forcePreviewOnly) effects.push("Service desk force-preview is ON.");
    } catch (_e) {
      /* ignore */
    }
  }
  return { enabled, effects };
}

function enableTrainingMode() {
  adoptionStateStore.save({ trainingMode: true });
  try {
    setServiceDeskFlags({ forcePreviewOnly: true });
  } catch (_e) {
    /* ignore */
  }
  logAdoptionEvent("training_mode_enabled", {});
  return getTrainingModeStatus();
}

function disableTrainingMode() {
  adoptionStateStore.save({ trainingMode: false });
  try {
    setServiceDeskFlags({ forcePreviewOnly: false });
  } catch (_e) {
    /* ignore */
  }
  logAdoptionEvent("training_mode_disabled", {});
  return getTrainingModeStatus();
}

module.exports = {
  getTrainingModeStatus,
  enableTrainingMode,
  disableTrainingMode,
};
