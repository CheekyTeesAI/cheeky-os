/**
 * Bundle 51 — GET /retargeting/targets, POST /retargeting/run
 */

const { Router } = require("express");
const { getRetargetingTargets } = require("../services/retargetingTargetsService");
const { runRetargetingPush } = require("../services/retargetingPushService");

const router = Router();

router.get("/targets", async (_req, res) => {
  try {
    const data = await getRetargetingTargets();
    return res.json({
      targets: Array.isArray(data.targets) ? data.targets : [],
      summary: data.summary || { critical: 0, high: 0, medium: 0, low: 0 },
    });
  } catch (err) {
    console.error("[retargeting/targets]", err.message || err);
    return res.json({
      targets: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
    });
  }
});

router.post("/run", async (_req, res) => {
  try {
    const out = await runRetargetingPush();
    return res.json({
      success: !!out.success,
      contacted: Math.max(0, Math.floor(Number(out.contacted) || 0)),
      ...(out.error ? { error: out.error } : {}),
    });
  } catch (err) {
    console.error("[retargeting/run]", err.message || err);
    return res.json({
      success: false,
      contacted: 0,
      error: String(err && err.message ? err.message : err),
    });
  }
});

module.exports = router;
