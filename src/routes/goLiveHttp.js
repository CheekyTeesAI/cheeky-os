/**
 * Go-live / cutover HTTP API
 */
const express = require("express");
const { getSystemModes, getGlobalOperationalMode } = require("../services/systemModeService");
const { runAllProviderTests } = require("../services/providerConnectivityService");
const { buildGoLiveReadinessReport } = require("../services/goLiveReadinessService");
const { previewCutover, executeCutover } = require("../services/cutoverService");
const { getOperationalContextAsync } = require("../services/operationalContext");
const { logAdoptionEvent } = require("../services/adoptionEventLog");

const router = express.Router();

router.get("/status", async (req, res) => {
  try {
    const modes = getSystemModes();
    const operationalContext = await getOperationalContextAsync();
    return res.status(200).json({
      success: true,
      time: new Date().toISOString(),
      globalMode: getGlobalOperationalMode(),
      modes,
      operationalContext,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "go_live_status_failed",
    });
  }
});

router.get("/providers", async (_req, res) => {
  try {
    logAdoptionEvent("provider_tests_run", { source: "http" });
    const tests = await runAllProviderTests();
    return res.status(200).json({ success: true, time: new Date().toISOString(), tests });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "provider_tests_failed",
    });
  }
});

router.get("/readiness", async (req, res) => {
  try {
    const report = await buildGoLiveReadinessReport(req.app);
    return res.status(200).json({ success: true, ...report });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "readiness_failed",
    });
  }
});

router.post("/preview", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const targetMode = String(body.targetMode || "").toUpperCase();
    const out = await previewCutover(targetMode, req.app);
    return res.status(200).json({ success: out.success, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "preview_failed",
    });
  }
});

router.post("/cutover", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const targetMode = String(body.targetMode || "").toUpperCase();
    if (targetMode === "LIVE" && body.confirm !== true) {
      return res.status(200).json({
        success: false,
        time: new Date().toISOString(),
        error: "confirm_required",
        message: 'Set "confirm": true to execute LIVE cutover.',
      });
    }
    const out = await executeCutover(targetMode, req.app);
    return res.status(200).json({ success: out.success, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "cutover_failed",
    });
  }
});

module.exports = router;
