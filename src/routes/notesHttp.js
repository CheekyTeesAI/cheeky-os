/**
 * POST /notes
 */
const express = require("express");
const { addManualNote } = require("../services/manualNoteService");

const router = express.Router();

router.post("/", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const relatedType = String(body.relatedType || "").trim();
    const relatedId = String(body.relatedId || "").trim();
    const note = String(body.note || "").trim();
    if (!relatedType || !relatedId || !note) {
      return res.status(200).json({ success: false, error: "relatedType_relatedId_note_required" });
    }
    const ev = addManualNote({
      relatedType,
      relatedId,
      note,
      author: body.author,
    });
    return res.status(200).json({ success: true, time: new Date().toISOString(), event: ev });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "note_failed" });
  }
});

module.exports = router;
