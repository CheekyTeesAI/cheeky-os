/**
 * Cheeky OS — Route: commands.js
 * Command center endpoint — send text, get action executed.
 * AI-first with keyword fallback.
 *
 * @module cheeky-os/routes/commands
 */

const { Router } = require("express");
const { routeCommand } = require("../commands/router");
const { executeCommand } = require("../commands/executor");
const { parseCommand } = require("../ai/command-brain");
const { logger } = require("../utils/logger");

const router = Router();

// ── POST /commands/run — execute a text command ─────────────────────────────
router.post("/run", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) {
      return res.json({ ok: false, data: null, error: "Missing text" });
    }

    logger.info(`[COMMANDS] POST /run — "${text}"`);

    let routed;
    let source = "keyword";

    // Try AI parse first
    try {
      const aiResult = await parseCommand(text);
      if (aiResult.action !== "unknown" && aiResult.confidence > 0.7) {
        routed = { action: aiResult.action, params: {} };
        source = "ai";
        logger.info(`[COMMANDS] AI routed → ${aiResult.action} (${aiResult.confidence})`);
      }
    } catch (aiErr) {
      logger.error(`[COMMANDS] AI parse failed (non-blocking): ${aiErr.message}`);
    }

    // Fallback to keyword router
    if (!routed) {
      routed = routeCommand(text);
      source = "keyword";
    }

    const result = await executeCommand(routed);

    const payload =
      result.data !== undefined
        ? result.data
        : result.result !== undefined
          ? result.result
          : null;

    res.json({
      ok: result.ok,
      data: {
        input: text,
        action: routed.action,
        source,
        result: payload,
      },
      error: result.error,
    });
  } catch (err) {
    res.json({ ok: false, data: null, error: err.message });
  }
});

module.exports = router;
