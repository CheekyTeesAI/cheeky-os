const express = require("express");
const router = express.Router();

const { buildWeeklyPlan, buildScheduleAnswer } = require("../services/weekPlanner");

router.get("/week", async (_req, res) => {
  try {
    const plan = await buildWeeklyPlan();
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      weeklyPlan: plan.week,
      blockedJobs: plan.blocked,
      outsourcedJobs: plan.outsourced,
      overflowJobs: plan.overflow,
      capacitySummary: plan.capacity,
      assumptions: plan.assumptions,
    });
  } catch (e) {
    console.error("[schedule/week]", e && e.message ? e.message : e);
    return res.status(200).json({
      success: false,
      mock: true,
      error: e && e.message ? e.message : "schedule_error",
      weeklyPlan: [],
    });
  }
});

router.get("/today", async (_req, res) => {
  try {
    const plan = await buildWeeklyPlan();
    const ans = await buildScheduleAnswer("today", plan);
    return res.status(200).json({
      success: true,
      mock: Boolean(ans.mock),
      todayPlan: ans.data.todayPlan,
      weeklyPlan: ans.data.weeklyPlan,
      capacitySummary: ans.data.capacitySummary,
    });
  } catch (e) {
    console.error("[schedule/today]", e && e.message ? e.message : e);
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/blocked", async (_req, res) => {
  try {
    const plan = await buildWeeklyPlan();
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      blockedJobs: plan.blocked,
      assumptions: plan.assumptions,
    });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, blockedJobs: [], error: e && e.message ? e.message : "error" });
  }
});

router.get("/outsourced", async (_req, res) => {
  try {
    const plan = await buildWeeklyPlan();
    return res.status(200).json({
      success: true,
      mock: Boolean(plan.mock),
      outsourcedJobs: plan.outsourced,
      weeklyPlan: plan.week,
    });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, outsourcedJobs: [], error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
