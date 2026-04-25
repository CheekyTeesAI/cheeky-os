"use strict";

const express = require("express");
const router = express.Router();
const { CHEEKY_listProductionJobsWithOrder, CHEEKY_advanceProductionJobStatus } = require("../services/productionService");

router.get("/api/production/jobs", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_listProductionJobsWithOrder.
  try {
    const out = await CHEEKY_listProductionJobsWithOrder();
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "production_jobs_failed", code: "PRODUCTION_JOBS_FAILED" }); }
});

router.post("/api/production/jobs/:id/advance", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_advanceProductionJobStatus.
  try {
    const out = await CHEEKY_advanceProductionJobStatus(String(req.params.id || "").trim());
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "production_job_advance_failed", code: "PRODUCTION_JOB_ADVANCE_FAILED" }); }
});

module.exports = router;
