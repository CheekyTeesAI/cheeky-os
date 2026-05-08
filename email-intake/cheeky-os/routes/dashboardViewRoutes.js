"use strict";

const express = require("express");

const dashboardViewService = require("../dashboard/dashboardViewService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/dashboard/view-descriptor", async (req, res) => {
  try {
    const mode = dashboardViewService.normalizeMode(req.query.mode || req.query.view);
    const data = dashboardViewService.describeView(mode);
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "View descriptor unavailable safely.", technicalCode: "dashboard_view_descriptor" }), {
        data: dashboardViewService.describeView("advisor"),
      })
    );
  }
});

module.exports = router;
