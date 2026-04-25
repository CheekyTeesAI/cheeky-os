"use strict";

const express = require("express");
const path = require("path");
const router = express.Router();

const { createBatches } = require("../services/printBatchService");
const { scoreOrder } = require("../services/priorityService");
const { CHEEKY_listPrintQueue } = require("../services/orderService");

router.get("/api/print/queue", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_listPrintQueue.
  try {
    const out = await CHEEKY_listPrintQueue();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    const prioritized = out.data
      .map((o) => ({ ...o, priorityScore: scoreOrder(o) }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    return res.status(200).json({ success: true, data: createBatches(prioritized) });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

router.get("/print.html", (_req, res) => {
  try {
    return res.sendFile(path.join(__dirname, "..", "views", "print.html"));
  } catch (e) {
    return res.status(500).send("view error");
  }
});

module.exports = router;
