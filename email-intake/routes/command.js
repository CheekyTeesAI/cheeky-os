"use strict";

const express = require("express");
require("../lib/config");
const { parseCommand } = require("../lib/commandParser");
const { routeCommand } = require("../lib/router");
const { runAutoIntake, shouldAutoIntake } = require("../lib/autoIntake");
const memory = require("../lib/memory");

const router = express.Router();

memory.ensureStructure();

router.post("/", async (req, res) => {
  try {
    const input = req.body?.input ?? req.body?.text ?? "";
    console.log("\n========== COMMAND API ==========");
    console.log("INPUT:", input);

    const parsed = parseCommand(input);
    console.log("PARSED →", JSON.stringify(parsed, null, 2));

    let result;
    if (shouldAutoIntake(parsed)) {
      console.log("AUTO INTAKE → estimate + notify email");
      result = await runAutoIntake(parsed);
    } else {
      result = await routeCommand(parsed);
    }
    console.log("RESULT →", JSON.stringify(result, null, 2));
    console.log("================================\n");

    const success = result.success !== false;
    const execution =
      result.execution && typeof result.execution === "object" ?
        result.execution
      : {
          action: String(parsed.type || "UNKNOWN"),
          mode: "stub",
          steps: [],
        };

    const payload = {
      success,
      parsed,
      execution,
    };
    if (result.estimate !== undefined) {
      payload.estimate = result.estimate;
    }
    if (result.email !== undefined) {
      payload.email = result.email;
    }
    if (result.tasks !== undefined) {
      payload.tasks = result.tasks;
    }
    if (result.errors !== undefined) {
      payload.errors = result.errors;
    }
    if (result.lead !== undefined) {
      payload.lead = result.lead;
    }
    res.json(payload);
  } catch (err) {
    console.error("COMMAND API ERROR", err);
    const message = err instanceof Error ? err.message : String(err);
    memory.appendLog(
      `## [${new Date().toISOString()}] COMMAND API ERROR\n- ${message}\n`
    );
    res.status(500).json({
      success: false,
      parsed: null,
      execution: {
        action: "error",
        mode: "stub",
        steps: [
          {
            name: "command_route",
            success: false,
            mode: "stub",
            message,
          },
        ],
      },
      error: message,
    });
  }
});

module.exports = router;
