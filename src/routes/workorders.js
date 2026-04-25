"use strict";

const express = require("express");
const router = express.Router();
const { buildWorkOrderPacket } = require("../services/workOrderPacketService");
const { CHEEKY_getWorkOrderData, CHEEKY_saveWorkOrderPacket, CHEEKY_listAllProductionJobs } = require("../services/productionService");

router.get("/api/workorders/:jobId", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_getWorkOrderData.
  try {
    const out = await CHEEKY_getWorkOrderData(req.params.jobId);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json({ success: true, data: buildWorkOrderPacket(out.job, out.order) });
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "workorder_fetch_failed", code: "WORKORDER_FETCH_FAILED" }); }
});

router.post("/api/workorders/:jobId/create", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_getWorkOrderData + CHEEKY_saveWorkOrderPacket.
  try {
    const out = await CHEEKY_getWorkOrderData(req.params.jobId);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    const packet = buildWorkOrderPacket(out.job, out.order);
    const saved = await CHEEKY_saveWorkOrderPacket(req.params.jobId, packet);
    if (!saved.success) return res.json({ success: false, error: saved.error, code: saved.code });
    return res.json(saved);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "workorder_create_failed", code: "WORKORDER_CREATE_FAILED" }); }
});

router.get("/api/workorders", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_listAllProductionJobs.
  try {
    const out = await CHEEKY_listAllProductionJobs();
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "workorder_list_failed", code: "WORKORDER_LIST_FAILED" }); }
});
const { getJobPacket } = require("../services/workOrderEngine");
const { logError } = require("../middleware/logger");

router.get("/:id/job-packet", async (req, res) => {
  try {
    const out = await getJobPacket(req.params.id);
    if (!out.success) {
      const status = out.code === "NOT_FOUND" ? 404 : out.code === "VALIDATION_ERROR" ? 400 : 503;
      return res.status(status).json({
        success: false,
        error: out.error || "failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/workorders/:id/job-packet", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
