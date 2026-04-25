/**
 * Preview and execute operational mode transitions — never forces risky sends.
 */
const { setGlobalOperationalMode, getGlobalOperationalMode } = require("./systemModeService");
const { validateLiveIntegrations } = require("./liveIntegrationValidator");
const { evaluateCutoverPolicy } = require("./cutoverPolicyService");
const { disableTrainingMode } = require("./trainingModeService");
const { logAdoptionEvent } = require("./adoptionEventLog");
const { MODES } = require("./operationalContext");

/**
 * @param {string} targetMode
 * @param {import("express").Application | null} app
 */
async function previewCutover(targetMode, app) {
  const tm = String(targetMode || "").toUpperCase();
  const changed = [];
  const skipped = [];
  const blocked = [];

  if (!MODES.includes(tm)) {
    blocked.push(`invalid_mode:${tm}`);
    return { targetMode: tm, changed, skipped, blocked, success: false };
  }

  const validation = await validateLiveIntegrations(app);
  const policy = evaluateCutoverPolicy(validation);

  if (tm === "LIVE" && !policy.canEnterLiveMode) {
    blocked.push(...policy.criticalBlockers);
    return { targetMode: tm, changed, skipped, blocked, success: false, policy };
  }

  changed.push(`set_globalOperationalMode:${tm}`);
  if (tm === "LIVE" || tm === "STAGING") {
    changed.push("disable_trainingMode:true");
    skipped.push("demo_data: not cleared (explicit demo clear only)");
    skipped.push("automation_dry_run: unchanged — adjust in automation config if needed");
  }
  if (tm === "BUILD" || tm === "TRAINING") {
    skipped.push("high_risk_sends: remain preview-first via existing comms rules");
  }

  logAdoptionEvent("cutover_preview", { targetMode: tm, changed });
  return { targetMode: tm, changed, skipped, blocked, success: true, policy };
}

/**
 * @param {string} targetMode
 * @param {import("express").Application | null} app
 */
async function executeCutover(targetMode, app) {
  const prev = getGlobalOperationalMode();
  const tm = String(targetMode || "").toUpperCase();
  const changed = [];
  const skipped = [];
  const blocked = [];

  if (!MODES.includes(tm)) {
    blocked.push(`invalid_mode:${tm}`);
    logAdoptionEvent("live_mode_blocked", { reason: "invalid_mode", targetMode: tm });
    return { targetMode: tm, changed, skipped, blocked, success: false, previousMode: prev };
  }

  const validation = await validateLiveIntegrations(app);
  const policy = evaluateCutoverPolicy(validation);

  if (tm === "LIVE" && !policy.canEnterLiveMode) {
    blocked.push(...policy.criticalBlockers);
    logAdoptionEvent("live_mode_blocked", { targetMode: tm, blockers: blocked });
    return { targetMode: tm, changed, skipped, blocked, success: false, previousMode: prev, policy };
  }

  const out = setGlobalOperationalMode(tm);
  if (!out.ok) {
    blocked.push("persist_failed");
    return { targetMode: tm, changed, skipped, blocked, success: false, previousMode: prev };
  }
  changed.push(`globalOperationalMode:${prev}->${tm}`);

  if (tm === "LIVE" || tm === "STAGING") {
    try {
      disableTrainingMode();
      changed.push("trainingMode:false");
    } catch (_e) {
      skipped.push("trainingMode:disable_failed");
    }
  }

  logAdoptionEvent("cutover_executed", { targetMode: tm, changed });
  if (tm === "LIVE") {
    logAdoptionEvent("live_mode_entered", { previousMode: prev });
  }

  return {
    targetMode: tm,
    changed,
    skipped,
    blocked,
    success: true,
    previousMode: prev,
  };
}

module.exports = { previewCutover, executeCutover };
