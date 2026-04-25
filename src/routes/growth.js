"use strict";

const express = require("express");
const router = express.Router();

const { getReactivationTargets, buildReactivationMessage } = require("../services/growthService");

router.get("/api/growth/reactivation", async (_req, res) => {
  try {
    const list = await getReactivationTargets();
    const output = list.slice(0, 20).map((c) => ({
      ...c,
      message: buildReactivationMessage(c),
    }));

    return res.json({
      success: true,
      data: output,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "growth_reactivation_failed",
    });
  }
});

module.exports = router;
