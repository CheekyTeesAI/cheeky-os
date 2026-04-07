/**
 * Bundle 45 — POST /auto/run (controlled auto-execution cycle).
 */

const { Router } = require("express");
const { runAutoExecutionCycle } = require("../services/autoExecutionService");

const router = Router();

router.post("/run", async (_req, res) => {
  try {
    const out = await runAutoExecutionCycle();
    return res.json({
      success: !!out.success,
      executed: Array.isArray(out.executed) ? out.executed : [],
      summary: out.summary || {
        followupsSent: 0,
        invoicesCreated: 0,
        productionMoves: 0,
      },
    });
  } catch (err) {
    console.error("[auto/run]", err.message || err);
    return res.json({
      success: false,
      executed: [],
      summary: {
        followupsSent: 0,
        invoicesCreated: 0,
        productionMoves: 0,
      },
    });
  }
});

module.exports = router;
