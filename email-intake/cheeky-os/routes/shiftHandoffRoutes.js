"use strict";

/**
 * Shift summary + handoff POST (Phase 2 cockpit continuity).
 */

const express = require("express");

const shiftHandoffService = require("../ops/shiftHandoffService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json());

router.get("/api/ops/shift-summary", async (_req, res) => {
  try {
    const data = await shiftHandoffService.computeShiftSummary();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Shift summary unavailable right now.", technicalCode: "shift_summary_failed", fallbackUsed: true }), { data: null })
    );
  }
});

router.post("/api/ops/shift-handoff", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const saved = shiftHandoffService.recordShiftHandoff(b);
    return res.json({ success: true, data: saved });
  } catch (_e) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not save handoff note.", technicalCode: "shift_handoff_write_failed", fallbackUsed: true }));
  }
});

module.exports = router;
