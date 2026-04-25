"use strict";

const express = require("express");
const router = express.Router();

const { runSelfHeal } = require("../services/selfHealService");

router.post("/api/self-heal", async (_req, res) => {
  try {
    await runSelfHeal();
    return res.json({
      success: true,
      message: "Self-heal complete",
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "self_heal_failed",
    });
  }
});

module.exports = router;
