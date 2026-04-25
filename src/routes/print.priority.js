"use strict";

const express = require("express");
const router = express.Router();

const { scoreOrder } = require("../services/priorityService");
const { CHEEKY_listPrintQueue } = require("../services/orderService");

router.get("/api/print/next", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_listPrintQueue (reuses same queue query).
  try {
    const out = await CHEEKY_listPrintQueue();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    const sorted = out.data.map((o) => ({ ...o, score: scoreOrder(o) })).sort((a, b) => b.score - a.score);
    return res.status(200).json({ success: true, data: sorted[0] || null });
  } catch (e) { return res.status(500).json({ success: false, error: e && e.message ? e.message : "internal_error", code: "INTERNAL_ERROR" }); }
});

module.exports = router;
