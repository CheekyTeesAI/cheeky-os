/**
 * Bundle 47 — GET /reactivation/targets, POST /reactivation/run
 */

const { Router } = require("express");
const { getReactivationTargets } = require("../services/reactivationTargetsService");
const { runReactivationPush } = require("../services/reactivationPushService");

const router = Router();

router.get("/targets", async (_req, res) => {
  try {
    const data = await getReactivationTargets(20);
    return res.json({
      customers: Array.isArray(data.customers) ? data.customers : [],
      summary: data.summary || { critical: 0, high: 0, medium: 0, low: 0 },
    });
  } catch (err) {
    console.error("[reactivation] /targets", err.message || err);
    return res.json({
      customers: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
    });
  }
});

router.post("/run", async (_req, res) => {
  try {
    const out = await runReactivationPush();
    return res.json({
      success: !!out.success,
      contacted: Math.max(0, Math.floor(Number(out.contacted) || 0)),
      ...(out.error ? { error: out.error } : {}),
    });
  } catch (err) {
    console.error("[reactivation] /run", err.message || err);
    return res.json({
      success: false,
      contacted: 0,
      error: String(err && err.message ? err.message : err),
    });
  }
});

module.exports = router;
