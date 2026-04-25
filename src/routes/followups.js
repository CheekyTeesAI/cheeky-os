"use strict";

const express = require("express");
const router = express.Router();
const { buildFollowups } = require("../services/followupService");

router.get("/run", async (_req, res) => {
  try {
    const data = await buildFollowups();
    return res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_run_failed",
      code: "FOLLOWUP_RUN_FAILED",
    });
  }
});

module.exports = router;
