/**
 * Global operational mode — persisted in adoption-state.json (additive).
 */
const adoptionStateStore = require("./adoptionStateStore");
const { MODES } = require("./operationalContext");

function getGlobalOperationalMode() {
  const st = adoptionStateStore.load();
  const m = String(st.globalOperationalMode || "BUILD").toUpperCase();
  return MODES.includes(m) ? m : "BUILD";
}

/**
 * @param {string} mode BUILD | TRAINING | STAGING | LIVE
 */
function setGlobalOperationalMode(mode) {
  const m = String(mode || "").toUpperCase();
  if (!MODES.includes(m)) {
    return { ok: false, error: "invalid_mode", allowed: MODES };
  }
  adoptionStateStore.save({ globalOperationalMode: m });
  return { ok: true, globalOperationalMode: m };
}

function inferSubsystemModes() {
  const squareToken = !!String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const resend = !!String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || "").trim();
  const twilio = !!(
    String(process.env.TWILIO_ACCOUNT_SID || "").trim() && String(process.env.TWILIO_AUTH_TOKEN || "").trim()
  );
  const bullseye = !!String(process.env.BULLSEYE_EMAIL || "").trim();
  const automationRunner = safe(() => {
    const ar = require("./automationRunner");
    const st = ar.loadState();
    const cfg = ar.getAutomationConfig ? ar.getAutomationConfig() : {};
    return { paused: !!st.paused, dryRun: !!cfg.dryRun };
  }, { paused: false, dryRun: true });

  return {
    square: squareToken ? "LIVE_CAPABLE" : "MOCK",
    email: resend ? "LIVE_CAPABLE" : "DEGRADED",
    sms: twilio ? "LIVE_CAPABLE" : "DEGRADED",
    storage: "FILE",
    vendorOutbound: bullseye || resend ? "PREVIEW_FIRST" : "DEGRADED",
    communications: resend ? "LIVE_CAPABLE" : "DEGRADED",
    automation: automationRunner.paused ? "PAUSED" : automationRunner.dryRun ? "DRY_RUN" : "ACTIVE",
  };
}

function safe(fn, fb) {
  try {
    return fn();
  } catch (_e) {
    return fb;
  }
}

function getSystemModes() {
  const st = adoptionStateStore.load();
  const globalMode = getGlobalOperationalMode();
  const persisted = st.subsystemModes && typeof st.subsystemModes === "object" ? st.subsystemModes : {};
  const inferred = inferSubsystemModes();
  const warnings = [];
  if (globalMode === "LIVE" && !String(process.env.SQUARE_ACCESS_TOKEN || "").trim()) {
    warnings.push("globalMode is LIVE but Square token missing — financial reads may be mock.");
  }
  if (st.trainingMode && globalMode === "LIVE") {
    warnings.push("trainingMode still true while global mode LIVE — run cutover or disable training.");
  }
  return {
    globalMode,
    subsystemModes: { ...inferred, ...persisted },
    trainingMode: !!st.trainingMode,
    warnings,
  };
}

module.exports = {
  getSystemModes,
  getGlobalOperationalMode,
  setGlobalOperationalMode,
  inferSubsystemModes,
};
