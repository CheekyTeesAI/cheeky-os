"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();

router.get("/summary", async (_req, res) => {
  try {
    const { buildOwnerSummary } = require(path.join(__dirname, "..", "services", "ownerSummary.service"));
    const out = await buildOwnerSummary();
    return res.status(200).json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      ok: true,
      headline: "Owner summary partially unavailable",
      cash: { depositPaidToday: 0, ordersAwaitingDeposit: 0, balanceDue: 0 },
      production: { ready: 0, printing: 0, qc: 0, completed: 0, stuck: 0 },
      jeremy: { assigned: 0, activeClock: false, hoursToday: 0 },
      comms: { needsApproval: 0, approved: 0, errors: 0 },
      sales: {
        openOpportunities: 0,
        highPriority: 0,
        estimatedPipeline: 0,
        draftsWaiting: 0,
      },
      risks: [msg],
      nextActions: [
        {
          priority: "HIGH",
          label: "Check API and logs",
          link: "/api/operator/status",
          reason: "Owner summary aggregator hit an exception",
        },
      ],
      warnings: ["owner_summary_exception"],
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
