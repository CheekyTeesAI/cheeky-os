/**
 * GET /art/queue | /print-ready | POST /art/upload
 */
const express = require("express");
const fs = require("fs");
const {
  getArtReviewQueue,
  getPrintReadyArt,
  moveArtStatus,
} = require("../services/artQueueService");
const { attachArtToIntakeOrJob } = require("../services/artOpsService");

const router = express.Router();

router.get("/queue", (_req, res) => {
  try {
    const queue = getArtReviewQueue();
    return res.status(200).json({ success: true, time: new Date().toISOString(), queue });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "art_queue_failed" });
  }
});

router.get("/print-ready", (_req, res) => {
  try {
    const queue = getPrintReadyArt();
    return res.status(200).json({ success: true, time: new Date().toISOString(), queue });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "art_print_ready_failed",
    });
  }
});

router.post("/upload", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const relatedType = String(body.relatedType || "JOB").toUpperCase();
    const relatedId = String(body.relatedId || "").trim();
    const filename = String(body.filename || "").trim();
    const pth = String(body.path || "").trim();
    if (!relatedId || !filename || !pth) {
      return res.status(200).json({ success: false, error: "relatedId_filename_path_required" });
    }
    if (!fs.existsSync(pth)) {
      return res.status(200).json({ success: false, error: "path_not_found", path: pth });
    }
    const art = attachArtToIntakeOrJob(relatedType, relatedId, {
      filename,
      path: pth,
      mimeType: body.contentType || body.mimeType,
      source: "MANUAL",
    });
    return res.status(200).json({ success: true, time: new Date().toISOString(), art });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "art_upload_failed" });
  }
});

router.post("/status", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const artFileId = String(body.artFileId || "").trim();
    const newStatus = String(body.newStatus || body.status || "").trim();
    const row = moveArtStatus(artFileId, newStatus);
    if (!row) return res.status(200).json({ success: false, error: "art_not_found_or_bad_status" });
    return res.status(200).json({ success: true, time: new Date().toISOString(), art: row });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "art_status_failed" });
  }
});

module.exports = router;
