/**
 * Commands router:
 * - GET /list: supported structured Chad commands
 * - POST /run: execute structured command directly
 */

const { Router } = require("express");
const path = require("path");

const commandRouter = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "commandRouter.js"
));

const router = Router();

router.get("/list", (_req, res) => {
  return res.json(commandRouter.getSupportedCommands());
});

router.post("/run", async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || "").trim();
    if (!text) {
      return res.status(400).json({
        success: false,
        error: "Missing text",
      });
    }
    const routed = commandRouter.routeCommand(text);
    if (!routed.matched) {
      return res.json({
        success: false,
        command: text,
        action: "UNMATCHED",
        result: { ok: false, message: "No structured command match" },
      });
    }
    const out = await commandRouter.executeRoutedCommand(routed);
    return res.json({
      success: !!out.ok,
      command: routed.normalized,
      action: routed.action,
      result: out,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
