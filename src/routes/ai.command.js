"use strict";

const express = require("express");
const router = express.Router();

const { interpret } = require("../services/aiInterpreter");
const { executeCommand } = require("../services/commandExecutor");
const { parseCommand } = require("../services/commandParser");

router.post("/", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let parsed = await interpret(body.input);
    if (!parsed || parsed.action === "UNKNOWN") {
      parsed = parseCommand(body.input);
    }
    const result = await executeCommand(parsed);
    return res.json({
      success: true,
      parsed,
      result,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "ai_command_failed",
      parsed: { action: "UNKNOWN" },
      result: { message: "Error: ai_command_failed" },
    });
  }
});

module.exports = router;
