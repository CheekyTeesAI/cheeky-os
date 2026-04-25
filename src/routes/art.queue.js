"use strict";

const express = require("express");
const router = express.Router();

const { createArt, updateArtStatus, getArtQueue } = require("../services/artService");

router.get("/api/art", async (_req, res) => {
  try {
    const queue = await getArtQueue();
    return res.json({ success: true, data: queue });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "art_queue_failed" });
  }
});

router.post("/api/art/:orderId/create", async (req, res) => {
  try {
    const art = await createArt(req.params.orderId);
    return res.json({ success: true, data: art });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "art_create_failed" });
  }
});

router.post("/api/art/:id/status", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const updated = await updateArtStatus(req.params.id, body.status);
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "art_status_failed" });
  }
});

module.exports = router;
