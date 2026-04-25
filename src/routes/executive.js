/**
 * Executive brain — POST/GET /executive/run
 */
const express = require("express");
const router = express.Router();

const { buildExecutiveSnapshot } = require("../services/executiveSnapshotService");

async function handleRun(_req, res) {
  try {
    const snapshot = await buildExecutiveSnapshot();
    return res.status(200).json({
      type: "executive",
      summary: snapshot.summary,
      actions: snapshot.actions,
      dailyFocus: snapshot.dailyFocus,
      cashflow: snapshot.cashflow,
      risks: snapshot.risks,
      opportunities: snapshot.opportunities,
      systemHealth: snapshot.systemHealth,
      assumptions: snapshot.assumptions,
      mock: Boolean(snapshot.mock),
      partialData: snapshot.partialData || [],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({
      type: "executive",
      summary: "Executive snapshot failed — see error.",
      actions: [],
      dailyFocus: {},
      cashflow: {},
      risks: {},
      opportunities: {},
      mock: true,
      error: e && e.message ? e.message : "executive_error",
      timestamp: new Date().toISOString(),
    });
  }
}

router.post("/run", handleRun);
router.get("/run", handleRun);

module.exports = router;
