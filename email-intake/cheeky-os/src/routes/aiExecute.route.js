"use strict";

const express = require("express");
const router = express.Router();
const execute = require("../ai/execute");

router.post("/api/ai/execute", async (req, res) => {
  try {
    const command = req && req.body ? req.body.command : null;
    try {
      console.log("[AI] execute request:", String(command || "").slice(0, 120));
    } catch (_) {}

    if (!command) {
      return res.status(400).json({
        success: false,
        error: "Missing command",
      });
    }

    const result = await execute(command);

    return res.json({
      success: true,
      command,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
