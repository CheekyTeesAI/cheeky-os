"use strict";

const express = require("express");

const teamActivityService = require("../team/teamActivityService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/team/activity", async (req, res) => {
  try {
    const lim = Number(req.query.limit);
    const data = teamActivityService.listActivities(lim);
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Team timeline unavailable safely.", technicalCode: "team_activity_fail" }), {
        data: {
          items: [],
          jeremyChecklist: [],
          patrickReviewChecklist: [],
          shiftNotes: [],
        },
      })
    );
  }
});

module.exports = router;
