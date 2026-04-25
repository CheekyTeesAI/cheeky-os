const express = require("express");
const path = require("path");
const router = express.Router();

const { runCommandPipeline } = require("../services/commandPipeline");
const { parseCommand } = require("../services/commandParser");
const { executeCommand } = require("../services/commandExecutor");

async function handle(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await runCommandPipeline(body);
    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[/command] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false,
      type: "query",
      summary: error && error.message ? error.message : "command_error",
      data: {},
      nextActions: [],
      mock: true,
      intent: "ERROR",
      result: { answer: "Command error.", intent: "ERROR" },
      timestamp: new Date().toISOString(),
    });
  }
}

router.post("/", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.input === "string") {
      const parsed = parseCommand(body.input);
      const result = await executeCommand(parsed);
      return res.status(200).json({
        success: true,
        parsed,
        result,
      });
    }
    return handle(req, res);
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "command_failed",
      parsed: { action: "UNKNOWN" },
      result: { message: "Error: command_failed" },
    });
  }
});
router.post("/run", handle);

router.get("/", (_req, res) => {
  return res.sendFile(path.join(__dirname, "..", "views", "command.html"));
});

module.exports = router;
