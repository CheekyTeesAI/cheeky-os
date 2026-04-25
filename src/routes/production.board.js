"use strict";

const express = require("express");
const path = require("path");
const router = express.Router();

const { CHEEKY_getProductionBoard, CHEEKY_listProductionJobsWithGarments, CHEEKY_advanceProductionJobFull } = require("../services/productionService");

function toBoardColumn(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DEPOSIT_PENDING" || s === "AWAITING_DEPOSIT") return "DEPOSIT";
  if (s === "PRODUCTION_READY") return "READY";
  if (s === "WAITING_GARMENTS" || s === "WAITING_ART") return "WAITING";
  if (s === "PRINTING") return "PRINTING";
  if (s === "QC") return "QC";
  if (s === "READY_FOR_PICKUP" || s === "READY") return "PICKUP";
  return null;
}

router.get("/api/production/board", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_getProductionBoard.
  try {
    const out = await CHEEKY_getProductionBoard();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    const grouped = { DEPOSIT: [], READY: [], WAITING: [], PRINTING: [], QC: [], PICKUP: [] };
    for (const o of out.data) { const col = toBoardColumn(o.status); if (col) grouped[col].push(o); }
    return res.status(200).json({ success: true, data: grouped });
  } catch (e) { return res.status(500).json({ success: false, error: e && e.message ? e.message : "internal_error", code: "INTERNAL_ERROR" }); }
});

router.get("/api/production/jobs", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_listProductionJobsWithGarments.
  try {
    const out = await CHEEKY_listProductionJobsWithGarments();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    const data = (out.data || []).map((j) => {
      const gList = j.garmentOrders || [];
      const hasOrdered = gList.some((g) => String(g.status || "").toUpperCase() === "ORDERED");
      const hasReceived = gList.some((g) => String(g.status || "").toUpperCase() === "RECEIVED");
      return { ...j, garmentsOrdered: hasOrdered || hasReceived, garmentsReceived: hasReceived };
    });
    return res.json({ success: true, data });
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "production_fetch_failed", code: "PRODUCTION_FETCH_FAILED" }); }
});

router.post("/api/production/jobs/:id/advance", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_advanceProductionJobFull.
  try {
    const out = await CHEEKY_advanceProductionJobFull(req.params.id);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "job_advance_failed", code: "JOB_ADVANCE_FAILED" }); }
});

router.get("/production.html", (_req, res) => {
  try {
    return res.sendFile(path.join(__dirname, "..", "views", "production.html"));
  } catch (e) {
    return res.status(500).send("view error");
  }
});

module.exports = router;
