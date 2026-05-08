"use strict";

const express = require("express");

const exceptionReportService = require("../reporting/exceptionReportService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/reporting/exceptions", async (_req, res) => {
  try {
    const data = await exceptionReportService.buildExceptionReport();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Exception report paused safely.", technicalCode: "exceptions_fail" }), {
        data: {
          generatedAt: new Date().toISOString(),
          exceptions: [
            {
              category: "reporting",
              severity: "low",
              headline: "Exception assembly deferred",
              detail: "Reload after cockpit data warms — no automated actions taken.",
            },
          ],
        },
      })
    );
  }
});

module.exports = router;
