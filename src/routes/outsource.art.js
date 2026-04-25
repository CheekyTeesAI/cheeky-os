"use strict";

const express = require("express");
const router = express.Router();
const { CHEEKY_attachOutsourceArt, CHEEKY_markOutsourceArtSent } = require("../services/productionService");

router.post("/api/outsource/:jobId/art/attach", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_attachOutsourceArt.
  try {
    const { artFileUrl, artFileName } = req.body || {};
    const out = await CHEEKY_attachOutsourceArt(req.params.jobId, artFileUrl, artFileName);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "outsource_art_attach_failed", code: "OUTSOURCE_ART_ATTACH_FAILED" }); }
});

router.post("/api/outsource/:jobId/art/sent", async (req, res) => {
  // [CHEEKY-GATE] Delegated to productionService.CHEEKY_markOutsourceArtSent.
  try {
    const out = await CHEEKY_markOutsourceArtSent(req.params.jobId);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "outsource_art_sent_failed", code: "OUTSOURCE_ART_SENT_FAILED" }); }
});

module.exports = router;
