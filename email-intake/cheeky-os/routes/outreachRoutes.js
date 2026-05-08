"use strict";

const express = require("express");

const outreachDraftService = require("../growth/outreachDraftService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json());

const GUARD_MSG =
  "This action requires Patrick approval. Outreach draft filed — never auto-send from Cheeky OS.";

router.post("/api/outreach/generate", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const outreachType = String(b.outreachType || "estimate_followup");
    const out = await outreachDraftService.generateOutreachDraft({
      outreachType,
      customer: b.customer,
      orderId: b.orderId,
      tone: b.tone,
      sequenceSteps: b.sequenceSteps,
      sequenceStep: b.sequenceStep,
      estimatedOpportunity: b.estimatedOpportunity != null ? Number(b.estimatedOpportunity) : null,
    });
    if (!out.ok || !out.approval) {
      return res.status(200).json(Object.assign(safeFailureResponse({ safeMessage: out.safeMessage || "Outreach draft failed.", technicalCode: "outreach_generate_fail" }), { data: null }));
    }
    return res.json({
      success: true,
      blocked: true,
      message: GUARD_MSG,
      approvalId: out.approval.id,
      pendingApprovalUrl: "/api/approvals/pending",
      data: { draft: out.draft, approval: out.approval },
    });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Outreach generate hit a guard rail.", technicalCode: "outreach_exception", fallbackUsed: true }));
  }
});

router.get("/api/outreach/drafts", async (_req, res) => {
  try {
    const items = outreachDraftService.listOutreachDrafts();
    return res.json({ success: true, data: { items, count: items.length } });
  } catch (_e) {
    return res.status(200).json(Object.assign(safeFailureResponse({ safeMessage: "Could not list outreach drafts.", technicalCode: "outreach_list_failed", fallbackUsed: true }), { data: { items: [], count: 0 } }));
  }
});

router.get("/api/outreach/drafts/:id", async (req, res) => {
  try {
    const row = outreachDraftService.getOutreachDraftById(String(req.params.id || ""));
    if (!row) {
      return res.status(200).json(Object.assign(safeFailureResponse({ safeMessage: "Outreach draft missing.", technicalCode: "outreach_miss" }), { data: null }));
    }
    return res.json({ success: true, data: row });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Outreach read failed safely.", technicalCode: "outreach_read_failed", fallbackUsed: true }));
  }
});

module.exports = router;
