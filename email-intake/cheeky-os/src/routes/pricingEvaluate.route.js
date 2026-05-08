"use strict";

const express = require("express");
const router = express.Router();
const {
  evaluateDeal,
  PROFIT_ENGINE_META,
} = require("../../services/profitEngine.service");

router.post("/api/pricing/evaluate", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = evaluateDeal(body);
    return res.json({ ...result, ...PROFIT_ENGINE_META });
  } catch (err) {
    console.error("[pricing/evaluate]", err && err.message ? err.message : err);
    return res.status(200).json({
      recommendedPrice: 0,
      minimumSafePrice: 0,
      marginAtRecommended: 0,
      marginAtMinimum: 0,
      riskLevel: "LOW_MARGIN",
      recommendation: err && err.message ? err.message : "Evaluation failed",
      error: err && err.message ? err.message : String(err),
      ...PROFIT_ENGINE_META,
    });
  }
});

module.exports = router;
