/**
 * Bundle 35 — autopilot guard control endpoints.
 */

const { Router } = require("express");
const {
  getState,
  enableAutopilot,
  disableAutopilot,
  activateKillSwitch,
  deactivateKillSwitch,
} = require("../services/autopilotGuardService");

const router = Router();

function actorFromBody(body) {
  return String(body && body.changedBy ? body.changedBy : "system").trim() || "system";
}

router.get("/status", (_req, res) => {
  return res.json(getState());
});

router.post("/enable", (req, res) => {
  return res.json({
    success: true,
    state: enableAutopilot(actorFromBody(req.body)),
  });
});

router.post("/disable", (req, res) => {
  return res.json({
    success: true,
    state: disableAutopilot(actorFromBody(req.body)),
  });
});

router.post("/kill", (req, res) => {
  return res.json({
    success: true,
    state: activateKillSwitch(actorFromBody(req.body)),
  });
});

router.post("/restore", (req, res) => {
  return res.json({
    success: true,
    state: deactivateKillSwitch(actorFromBody(req.body)),
  });
});

module.exports = router;
console.log("🔥 USING THIS FILE: square-client.js");
const { Router } = require("express");
const runAutopilot = require("../autopilot/engine");
const { logger } = require("../utils/logger");

const router = Router();
console.log("[LIVE ROUTE FILE] autopilot loaded from:", __filename);

async function handleAutopilotRun(req, res, source) {
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  try {
    const result = await runAutopilot();
    return res.json({
      ok: !!result.ok,
      data: result.data || {},
      error: result.error || null,
      source,
    });
  } catch (err) {
    logger.error(`[AUTOPILOT] /run failed: ${err.message}`);
    return res.json({
      ok: false,
      data: null,
      error: `Failed at ${base}/cheeky/autopilot/run: ${err.message}`,
    });
  }
}

router.get("/run", async (req, res) => handleAutopilotRun(req, res, "GET"));
router.get("/tick", async (req, res) => handleAutopilotRun(req, res, "TICK"));

module.exports = router;
