"use strict";

const express = require("express");

const trust = require("../trust/trustScoringEngine");

const router = express.Router();

router.get("/api/trust/score", (_req, res) => {
  try {
    const payload = trust.computeTrustScore();
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "trust_score_failed" });
  }
});

router.get("/api/trust/warnings", (_req, res) => {
  try {
    const payload = trust.computeTrustScore();
    return res.json({ success: true, data: { warnings: payload.warnings || [] } });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "trust_warnings_failed" });
  }
});

router.get("/api/trust/recommendations", (_req, res) => {
  try {
    const payload = trust.computeTrustScore();
    return res.json({ success: true, data: { recommendations: payload.recommendations || [] } });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "trust_recommendations_failed" });
  }
});

module.exports = router;
