/**
 * Adoption layer HTTP — GET /setup/*, GET /help/*
 */
const express = require("express");
const { getFirstRunStatus } = require("../services/firstRunService");
const { buildSetupChecklist, runInitialSetup, markSetupStepComplete } = require("../services/setupWizardService");
const { seedDemoData, clearDemoData, getDemoDataStatus } = require("../services/demoDataService");
const { getWorkflowGuides } = require("../services/guidedWorkflowService");
const { getHelpContent } = require("../services/helpContentService");
const { getTour } = require("../services/uiTourService");
const {
  getTrainingModeStatus,
  enableTrainingMode,
  disableTrainingMode,
} = require("../services/trainingModeService");
const adoptionStateStore = require("../services/adoptionStateStore");
const { logAdoptionEvent } = require("../services/adoptionEventLog");

const router = express.Router();

router.get("/status", async (_req, res) => {
  try {
    const firstRun = await getFirstRunStatus();
    const training = getTrainingModeStatus();
    const demo = getDemoDataStatus();
    return res.status(200).json({
      success: true,
      time: new Date().toISOString(),
      firstRun,
      training,
      demo,
      adoptionState: adoptionStateStore.load(),
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "setup_status_failed",
    });
  }
});

router.post("/run", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(body.mode || "SAFE").toUpperCase();
    const out = await runInitialSetup({ mode });
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "setup_run_failed",
    });
  }
});

router.get("/checklist", (_req, res) => {
  try {
    const checklist = buildSetupChecklist();
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...checklist });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "checklist_failed" });
  }
});

router.post("/demo/seed", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await seedDemoData({ confirm: body.confirm === true });
    return res.status(200).json({ success: !!out.ok, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "demo_seed_failed" });
  }
});

router.post("/demo/clear", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await clearDemoData({ confirm: body.confirm === true });
    return res.status(200).json({ success: !!out.ok, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "demo_clear_failed" });
  }
});

router.get("/guides/:role", (req, res) => {
  try {
    const role = String(req.params.role || "OWNER").toUpperCase();
    logAdoptionEvent("guide_viewed", { role });
    const g = getWorkflowGuides(role);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...g });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "guides_failed" });
  }
});

router.get("/tour/:role", (req, res) => {
  try {
    const role = String(req.params.role || "OWNER").toUpperCase();
    logAdoptionEvent("tour_viewed", { role });
    const t = getTour(role);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...t });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "tour_failed" });
  }
});

router.post("/step/complete", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const stepKey = String(body.stepKey || "").trim();
    if (!stepKey) return res.status(200).json({ success: false, error: "stepKey_required" });
    const out = markSetupStepComplete(stepKey);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "step_failed" });
  }
});

router.post("/onboarding/complete", (req, res) => {
  try {
    adoptionStateStore.save({ onboardingCompletedAt: new Date().toISOString() });
    logAdoptionEvent("onboarding_completed", {});
    return res.status(200).json({ success: true, time: new Date().toISOString(), completed: true });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "onboarding_failed" });
  }
});

router.get("/training", (_req, res) => {
  return res.status(200).json({ success: true, time: new Date().toISOString(), ...getTrainingModeStatus() });
});

router.post("/training/enable", (_req, res) => {
  try {
    const st = enableTrainingMode();
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...st });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "training_enable_failed" });
  }
});

router.post("/training/disable", (_req, res) => {
  try {
    const st = disableTrainingMode();
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...st });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "training_disable_failed" });
  }
});

module.exports = router;
