"use strict";

const express = require("express");
const {
  buildProgramsPayload,
  MARKET_DOMINATION_META,
} = require("../../services/marketDominationEngine.service");

const router = express.Router();

const PROGRAMS_WRAP = { marketDomination: true, noAutoSend: true };

router.get("/api/programs", async (_req, res) => {
  try {
    const body = await buildProgramsPayload();
    return res.json({ ...body, ...PROGRAMS_WRAP });
  } catch (err) {
    console.error("[programs]", err && err.message ? err.message : err);
    return res.status(200).json({
      activePrograms: [],
      potentialPrograms: [],
      revenueForecast: 0,
      error: err && err.message ? err.message : String(err),
      ...MARKET_DOMINATION_META,
      ...PROGRAMS_WRAP,
    });
  }
});

module.exports = router;
