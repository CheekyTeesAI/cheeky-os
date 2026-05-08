"use strict";

const express = require("express");

const selfServiceIntakeService = require("../intake/selfServiceIntakeService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json({ limit: "256kb" }));

router.post("/api/intake/self-service", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = selfServiceIntakeService.submitSelfServicePayload(body);
    if (!out.ok) {
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: out.safeMessage || "Intake paused.", technicalCode: "intake_validate" }), {
          data: null,
        })
      );
    }
    return res.json({
      success: true,
      data: {
        confirmationMessageCustomerFriendly: out.confirmationMessageCustomerFriendly,
        estimatedReviewTimeline: out.estimatedReviewTimeline,
        intakeReference: out.intakeReference,
        approvalQueued: out.approvalQueued,
        sanitized: out.intakeItemSanitized,
        note: selfServiceIntakeService.PHASE5_NOTE,
      },
    });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Submission did not complete safely.", technicalCode: "intake_submit_fail" }), {
        data: null,
      })
    );
  }
});

router.get("/api/intake/queue", async (_req, res) => {
  try {
    const data = {
      items: selfServiceIntakeService.listQueueSnapshot(80),
      pendingCount: selfServiceIntakeService.listPendingIntake(200).length,
      note: selfServiceIntakeService.PHASE5_NOTE,
    };
    return res.json({ success: true, data });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Could not read intake queue safely.", technicalCode: "intake_queue_fail" }), {
        data: { items: [], pendingCount: 0 },
      })
    );
  }
});

module.exports = router;
