"use strict";

const express = require("express");
const router = express.Router();

const { createQuote, CHEEKY_resolveQuoteId } = require("../services/quoteService");
const { createDepositFromQuote } = require("../services/depositService");
const { createProductionJob, CHEEKY_advanceProductionJobStatus } = require("../services/productionService");
const { createGarmentOrder } = require("../services/garmentService");
const { createReorderFromOrder } = require("../services/reorderService");

router.post("/api/actions/run", async (req, res) => {
  // [CHEEKY-GATE] resolveQuoteId delegated to quoteService.CHEEKY_resolveQuoteId.
  // [CHEEKY-GATE] ADVANCE_JOB delegated to productionService.CHEEKY_advanceProductionJobStatus.
  try {
    const { action, id } = req.body || {};
    let result = null;

    if (action === "CREATE_QUOTE") {
      result = await createQuote(id);
    } else if (action === "CREATE_DEPOSIT") {
      const quoteId = await CHEEKY_resolveQuoteId(id);
      result = await createDepositFromQuote(quoteId);
    } else if (action === "CREATE_JOB") {
      result = await createProductionJob(id);
    } else if (action === "ORDER_GARMENTS") {
      result = await createGarmentOrder(id);
    } else if (action === "ADVANCE_JOB") {
      const out = await CHEEKY_advanceProductionJobStatus(id);
      if (!out.success) throw new Error(out.code || "ADVANCE_FAILED");
      result = out.data;
    } else if (action === "REORDER") {
      result = await createReorderFromOrder(id);
    } else {
      throw new Error("UNKNOWN_ACTION");
    }

    return res.json({ success: true, action, data: result });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "action_failed", action: req.body && req.body.action });
  }
});

module.exports = router;
