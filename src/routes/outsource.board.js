"use strict";

const express = require("express");
const router = express.Router();
const { CHEEKY_listOutsourceJobs } = require("../services/productionService");

router.get("/api/outsource/board", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_listOutsourceJobs.
  try {
    const out = await CHEEKY_listOutsourceJobs();
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "outsource_board_failed", code: "OUTSOURCE_BOARD_FAILED" }); }
});

module.exports = router;
