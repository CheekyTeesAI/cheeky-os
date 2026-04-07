/**
 * Bundle 35 — autopilot guard control endpoints + engine run/tick (single router).
 */

const { Router } = require("express");
const {
  getState,
  enableAutopilot,
  disableAutopilot,
  activateKillSwitch,
  deactivateKillSwitch,
} = require("../services/autopilotGuardService");
const runAutopilot = require("../autopilot/engine");
const { logger } = require("../utils/logger");
const { recordLedgerEventSafe } = require("../services/actionLedgerService");

const router = Router();

function actorFromBody(body) {
  return String(body && body.changedBy ? body.changedBy : "system").trim() || "system";
}

router.get("/status", (_req, res) => {
  return res.json(getState());
});

router.post("/enable", (req, res) => {
  const actor = actorFromBody(req.body);
  recordLedgerEventSafe({
    type: "autopilot",
    action: "autopilot_enable",
    status: "success",
    reason: `Enabled by ${actor}`,
    meta: { actor },
  });
  return res.json({
    success: true,
    state: enableAutopilot(actor),
  });
});

router.post("/disable", (req, res) => {
  const actor = actorFromBody(req.body);
  recordLedgerEventSafe({
    type: "autopilot",
    action: "autopilot_disable",
    status: "success",
    reason: `Disabled by ${actor}`,
    meta: { actor },
  });
  return res.json({
    success: true,
    state: disableAutopilot(actor),
  });
});

router.post("/kill", (req, res) => {
  const actor = actorFromBody(req.body);
  recordLedgerEventSafe({
    type: "autopilot",
    action: "autopilot_kill_switch",
    status: "blocked",
    reason: `Kill switch activated by ${actor}`,
    meta: { actor },
  });
  return res.json({
    success: true,
    state: activateKillSwitch(actor),
  });
});

router.post("/restore", (req, res) => {
  const actor = actorFromBody(req.body);
  recordLedgerEventSafe({
    type: "autopilot",
    action: "autopilot_restore",
    status: "success",
    reason: `Kill switch cleared by ${actor}`,
    meta: { actor },
  });
  return res.json({
    success: true,
    state: deactivateKillSwitch(actor),
  });
});

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
