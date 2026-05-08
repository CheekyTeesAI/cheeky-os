"use strict";

/**
 * Phase 2 drafting HTTP — recommend + draft files only; approvals created for every generate.
 */

const express = require("express");

const workOrderDraftService = require("../drafting/workOrderDraftService");
const garmentOrderDraftService = require("../drafting/garmentOrderDraftService");
const followUpDraftService = require("../drafting/followUpDraftService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json());

const GUARD = "This action requires Patrick approval. Draft created and pending.";

router.get("/api/drafts/work-order/:orderId", async (req, res) => {
  try {
    const d = workOrderDraftService.getWorkOrderDraft(String(req.params.orderId || ""));
    if (!d) {
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: "No saved work-order draft for that id yet.", technicalCode: "draft_missing" }), {
          data: null,
        })
      );
    }
    return res.json({ success: true, data: d });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not read work-order draft safely.", technicalCode: "draft_read_failed", fallbackUsed: true }));
  }
});

router.get("/api/drafts/garment-order/:orderId", async (req, res) => {
  try {
    const d = garmentOrderDraftService.getGarmentOrderDraft(String(req.params.orderId || ""));
    if (!d) {
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: "No garment draft on file for that order id.", technicalCode: "garment_draft_missing" }), { data: null })
      );
    }
    return res.json({ success: true, data: d });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not read garment draft safely.", technicalCode: "garment_draft_read_failed", fallbackUsed: true }));
  }
});

router.get("/api/drafts/follow-up/:orderId", async (req, res) => {
  try {
    const t = String(req.query.type || "order_update");
    const d = followUpDraftService.getFollowUpDraft(String(req.params.orderId || ""), t);
    if (!d) {
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: "No follow-up draft for that order/type yet.", technicalCode: "followup_draft_missing" }), { data: null })
      );
    }
    return res.json({ success: true, data: d });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not read follow-up draft safely.", technicalCode: "followup_read_failed", fallbackUsed: true }));
  }
});

router.get("/api/drafts/pending", async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        workOrders: workOrderDraftService.listPendingWorkOrderDrafts(),
        garmentOrders: garmentOrderDraftService.listPendingGarmentDrafts(),
        followUps: followUpDraftService.listPendingFollowUpDrafts(),
      },
    });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not enumerate pending drafts.", technicalCode: "drafts_list_failed", fallbackUsed: true }));
  }
});

router.post("/api/drafts/generate", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = String(b.orderId || "").trim();
    const draftType = String(b.draftType || "").trim().toLowerCase();
    const followType = String(b.followUpType || b.follow_type || "order_update").toLowerCase();

    if (!orderId) {
      return res.status(200).json(safeFailureResponse({ safeMessage: "orderId is required.", technicalCode: "draft_missing_order", fallbackUsed: false }));
    }

    if (draftType === "work_order") {
      const out = await workOrderDraftService.generateWorkOrderDraft(orderId);
      if (!out.ok || !out.approval) {
        return res.status(200).json(
          Object.assign(safeFailureResponse({ safeMessage: out.safeMessage || "Work order draft failed.", technicalCode: "work_order_draft_failed" }), { data: out })
        );
      }
      return res.json({
        success: true,
        blocked: true,
        message: GUARD,
        approvalId: out.approval.id,
        pendingApprovalUrl: "/api/approvals/pending",
        data: { draft: out.draft, approval: out.approval },
      });
    }

    if (draftType === "garment_order") {
      const out = await garmentOrderDraftService.generateGarmentOrderDraft(orderId);
      if (!out.ok || !out.approval) {
        return res.status(200).json(
          Object.assign(safeFailureResponse({ safeMessage: out.safeMessage || "Garment draft failed.", technicalCode: "garment_draft_failed" }), { data: out })
        );
      }
      return res.json({
        success: true,
        blocked: true,
        message: GUARD,
        approvalId: out.approval.id,
        pendingApprovalUrl: "/api/approvals/pending",
        data: { draft: out.draft, approval: out.approval },
      });
    }

    if (draftType === "follow_up" || draftType === "followup") {
      const out = await followUpDraftService.generateFollowUpDraft(orderId, followType);
      if (!out.ok || !out.approval) {
        return res.status(200).json(
          Object.assign(safeFailureResponse({ safeMessage: out.safeMessage || "Follow-up draft failed.", technicalCode: "followup_draft_failed" }), { data: out })
        );
      }
      return res.json({
        success: true,
        blocked: true,
        message: GUARD,
        approvalId: out.approval.id,
        pendingApprovalUrl: "/api/approvals/pending",
        data: { draft: out.draft, approval: out.approval },
      });
    }

    return res.status(200).json(
      safeFailureResponse({
        safeMessage: "Unknown draftType — use work_order, garment_order, or follow_up.",
        technicalCode: "draft_type_unknown",
        fallbackUsed: false,
      })
    );
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Draft generate hit a guard rail.", technicalCode: "draft_generate_exception", fallbackUsed: true }));
  }
});

router.post("/api/drafts/consolidate-garments", async (_req, res) => {
  try {
    const out = await garmentOrderDraftService.consolidateGarmentNeeds();
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Garment consolidation scan failed safely.", technicalCode: "consolidate_failed", fallbackUsed: true }));
  }
});

module.exports = router;
