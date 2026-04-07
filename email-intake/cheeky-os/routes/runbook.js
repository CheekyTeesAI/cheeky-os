/**
 * Bundle 34 — POST /runbook/run (full daily cycle; no auto notification send).
 */

const { Router } = require("express");
const { executeDailyRunbook } = require("../services/runbookService");
const { recordLedgerEventSafe } = require("../services/actionLedgerService");

const router = Router();

router.post("/run", async (_req, res) => {
  try {
    const out = await executeDailyRunbook();
    const { summary, events, steps } = out;
    const anyFail =
      Array.isArray(steps) && steps.some((s) => s && s.ok === false);
    recordLedgerEventSafe({
      type: "runbook",
      action: "runbook_completed",
      status: anyFail ? "info" : "success",
      reason: `followups:${summary.followups} invoices:${summary.invoices} production:${summary.productionMoves} alerts:${summary.alerts}`,
      meta: { stepCount: Array.isArray(steps) ? steps.length : 0, eventCount: Array.isArray(events) ? events.length : 0 },
    });
    return res.json({
      success: true,
      summary,
      events,
    });
  } catch (err) {
    console.error("[runbook/run]", err.message || err);
    recordLedgerEventSafe({
      type: "runbook",
      action: "runbook_completed",
      status: "blocked",
      reason: err instanceof Error ? err.message : String(err || "runbook error"),
    });
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
