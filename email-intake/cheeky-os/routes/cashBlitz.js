/**
 * Bundle 46 — POST /cash/blitz
 */

const { Router } = require("express");
const { runCashBlitz } = require("../services/cashBlitzService");

const router = Router();

router.post("/blitz", async (_req, res) => {
  try {
    const out = await runCashBlitz();
    return res.json({
      success: !!out.success,
      targets: Array.isArray(out.targets) ? out.targets : [],
      executed: Array.isArray(out.executed) ? out.executed : [],
      summary: out.summary || {},
    });
  } catch (err) {
    console.error("[cash/blitz]", err.message || err);
    return res.json({
      success: false,
      targets: [],
      executed: [],
      summary: {},
    });
  }
});

module.exports = router;
