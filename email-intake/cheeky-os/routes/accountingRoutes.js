"use strict";

const express = require("express");

const accountingVisibilityService = require("../accounting/accountingVisibilityService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/accounting/summary", async (_req, res) => {
  try {
    const data = await accountingVisibilityService.summarizeAccounts();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Accounting summary paused safely.", technicalCode: "accounting_summary_failed", fallbackUsed: true }), {
        data: {
          reachable: false,
          generatedAt: new Date().toISOString(),
          arAgingBuckets: { open_sample: { count: 0, outstandingUsd: 0 } },
          outstandingBalanceUsdApprox: "unknown",
          revenueByMonth: {},
          revenueByQuarter: {},
          profitabilitySamples: [],
          qbXeroPrep: { note: "insufficient_data" },
          guardrailEcho: "",
        },
      })
    );
  }
});

router.get("/api/accounting/ar-aging", async (_req, res) => {
  try {
    const full = await accountingVisibilityService.summarizeAccounts();
    return res.json({
      success: true,
      data: {
        generatedAt: full.generatedAt,
        arAgingBuckets: full.arAgingBuckets,
        outstandingBalanceUsdApprox: full.outstandingBalanceUsdApprox,
        guardrailEcho: full.guardrailEcho,
      },
    });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "AR aging unavailable safely.", technicalCode: "ar_aging_failed" }), {
        data: { buckets: "unknown", note: "safe_empty" },
      })
    );
  }
});

router.get("/api/accounting/export-preview", async (_req, res) => {
  try {
    const data = await accountingVisibilityService.buildExportPreview();
    return res.json({ success: true, data });
  } catch (_e3) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Export preview halted safely.", technicalCode: "accounting_export_preview_fail" }), {
        data: { headline: "insufficient_data" },
      })
    );
  }
});

module.exports = router;
