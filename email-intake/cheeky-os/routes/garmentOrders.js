"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");
const garmentOrderDrafts = require("../garments/garmentOrderDrafts");
const dashboardDataService = require("../dashboard/dashboardDataService");

const router = express.Router();

router.get("/api/garments/needed", async (_req, res) => {
  try {
    const gb = await dashboardDataService.buildGarmentBoard();
    return res.json({
      success: true,
      data: {
        needingBlanks: gb.needingBlanks,
        carolinaCandidates: gb.carolinaDraftCandidates,
        waitingOnGarments: gb.waitingOnGarments,
        note: gb.note,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.post("/api/garments/create-carolina-made-draft", express.json({ limit: "512kb" }), (req, res) => {
  try {
    safety.auditLog({
      eventType: "garment_draft_carolina_v8",
      taskId: null,
      actor: req.body?.requestedBy || "http",
      metadata: { vendor: garmentOrderDrafts.PRIMARY_VENDOR, autoSend: false },
    });

    const b = req.body && typeof req.body === "object" ? req.body : {};
    const row = garmentOrderDrafts.createCarolinaMadeDraft({
      orderId: b.orderId,
      customerName: b.customerName,
      styles: b.styles || b.lines || [],
      notes: b.notes,
    });

    return res.json({
      success: true,
      data: row,
      message:
        "Internal Carolina Made draft persisted — approval required before any outbound email/order.",
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/garments/drafts", (req, res) => {
  try {
    const lim = Math.min(200, Math.max(5, Number(req.query.limit) || 80));
    return res.json({ success: true, data: garmentOrderDrafts.listDrafts(lim) });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

module.exports = router;
