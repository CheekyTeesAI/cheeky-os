"use strict";

const express = require("express");

const insightSvc = require("../growth/googleAdsInsightService");
const draftSvc = require("../growth/googleAdsDraftService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json());

router.get("/api/growth/google-ads/insights", async (_req, res) => {
  try {
    const data = insightSvc.readInsightsSafe();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({ safeMessage: "Google Ads insights unavailable safely.", technicalCode: "gads_insights_fail" }),
        {
          data: { campaigns: [], note: "insufficient_data", guardrailEcho: insightSvc.guardrailEcho() },
        }
      )
    );
  }
});

router.get("/api/growth/google-ads/recommendations", async (req, res) => {
  try {
    const lim = Math.min(80, Math.max(4, Number(req.query.limit) || 20));
    const data = { items: draftSvc.listRecommendations(lim), guardrailEcho: insightSvc.guardrailEcho() };
    return res.json({ success: true, data });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Recommendations paused safely.", technicalCode: "gads_rec_fail" }), {
        data: { items: [] },
      })
    );
  }
});

router.post("/api/growth/google-ads/import-report", async (req, res) => {
  try {
    const doc = insightSvc.importReport(req.body && typeof req.body === "object" ? req.body : {});
    return res.json({ success: true, data: doc, message: "Imported locally only — no Ads API mutation." });
  } catch (_e3) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Import did not complete safely.", technicalCode: "gads_import_fail" }));
  }
});

router.post("/api/growth/google-ads/generate-drafts", async (_req, res) => {
  try {
    const out = draftSvc.generateDraftsFromInsights(insightSvc.readInsightsSafe());
    if (!out.items || !out.items.length) {
      return res.status(200).json(
        Object.assign(
          safeFailureResponse({
            safeMessage: "Nothing to draft yet — import performance rows first.",
            technicalCode: "gads_draft_empty",
            fallbackUsed: true,
          }),
          { data: out }
        )
      );
    }
    return res.json({
      success: true,
      blocked: true,
      message: "Drafts saved + approval tickets created where possible — Patrick still chooses Google Ads Editor actions.",
      data: out,
    });
  } catch (_e4) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Draft generation stopped safely.", technicalCode: "gads_draft_fail" }));
  }
});

module.exports = router;
