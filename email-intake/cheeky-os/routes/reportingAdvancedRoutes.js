"use strict";

const express = require("express");

const advancedReportService = require("../reporting/advancedReportService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/reporting/advanced/weekly", async (_req, res) => {
  try {
    const data = await advancedReportService.summarizeWeeklyMonthly();
    return res.json({ success: true, data: { horizon: "7d_notes", envelope: data } });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Weekly rollup paused safely.", technicalCode: "weekly_report_safe" }), {
        data: { horizon: "7d_notes", bullets: [], note: "insufficient_data" },
      })
    );
  }
});

router.get("/api/reporting/advanced/monthly", async (_req, res) => {
  try {
    const data = await advancedReportService.summarizeWeeklyMonthly();
    return res.json({ success: true, data: { horizon: "30d_via_kpi_cache", envelope: data } });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Monthly rollup halted safely.", technicalCode: "monthly_report_safe" }), {
        data: { bullets: [], note: "unknown" },
      })
    );
  }
});

router.get("/api/reporting/advanced/export/:type", async (req, res) => {
  try {
    const csv = await advancedReportService.csvByType(req.params.type || "", Number(req.query.limit));
    const filenameSafe = String(req.params.type || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 48);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="cheeky-os-export-${filenameSafe}-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (_e3) {
    const sf = safeFailureResponse({ safeMessage: "CSV export paused safely.", technicalCode: "export_csv_blocked" });
    return res.status(200).send(`"${sf.safeMessage}"\r\n`);
  }
});

module.exports = router;
