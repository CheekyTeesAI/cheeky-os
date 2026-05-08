"use strict";

const express = require("express");

const leadScoringService = require("../growth/leadScoringService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/growth/leads/scores", async (req, res) => {
  try {
    const refresh = String(req.query.refresh || "").toLowerCase() === "1" || String(req.query.refresh || "").toLowerCase() === "true";
    const lim = Math.min(120, Math.max(1, Number(req.query.limit) || 40));
    let list = [];
    if (refresh) list = await leadScoringService.getTopLeadsFresh(lim);
    else list = leadScoringService.getTopLeads(lim);

    const note =
      (!list || !list.length)
        ? "No major growth opportunities currently detected."
        : null;

    return res.json({
      success: true,
      data: { leads: list || [], count: list ? list.length : 0, note },
    });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Lead scoring unavailable safely.", technicalCode: "growth_scores_failed", fallbackUsed: true }), { data: { leads: [], note: null } })
    );
  }
});

router.get("/api/growth/leads/:leadId", async (req, res) => {
  try {
    const row = leadScoringService.getLeadById(req.params.leadId);
    if (!row) {
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: "Lead score not cached yet — run GET /api/growth/leads/scores?refresh=1.", technicalCode: "lead_miss" }), { data: null })
      );
    }
    return res.json({ success: true, data: row });
  } catch (_e2) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not fetch lead safely.", technicalCode: "lead_get_failed", fallbackUsed: true }));
  }
});

module.exports = router;
