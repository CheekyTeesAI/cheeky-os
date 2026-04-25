"use strict";

const express = require("express");
const router = express.Router();
const { runAutoOperator } = require("../services/autoOperator");

router.get("/", async (_req, res) => {
  try {
    const data = await runAutoOperator();
    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "ai_status_failed",
    });
  }
});

module.exports = router;
