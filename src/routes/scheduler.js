"use strict";

const express = require("express");
const router = express.Router();
const { autoScheduleJobs, getTodayJobs } = require("../services/schedulerService");

router.post("/api/schedule/run", async (_req, res) => {
  try {
    const out = await autoScheduleJobs();
    return res.json({
      success: true,
      message: "Scheduling complete",
      data: out,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "schedule_run_failed",
    });
  }
});

router.get("/api/schedule/today", async (_req, res) => {
  try {
    const jobs = await getTodayJobs();
    return res.json({
      success: true,
      data: jobs,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "schedule_today_failed",
    });
  }
});

module.exports = router;
