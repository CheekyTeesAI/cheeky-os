/**
 * Bundle 34 — POST /runbook/run (full daily cycle; no auto notification send).
 */

const { Router } = require("express");
const { executeDailyRunbook } = require("../services/runbookService");

const router = Router();

router.post("/run", async (_req, res) => {
  try {
    const { summary, events } = await executeDailyRunbook();
    return res.json({
      success: true,
      summary,
      events,
    });
  } catch (err) {
    console.error("[runbook/run]", err.message || err);
    return res.json({
      success: false,
      summary: {
        followups: 0,
        invoices: 0,
        productionMoves: 0,
        alerts: 0,
      },
      events: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
