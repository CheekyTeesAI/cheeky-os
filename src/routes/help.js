const express = require("express");
const { getHelpContent } = require("../services/helpContentService");
const { logAdoptionEvent } = require("../services/adoptionEventLog");

const router = express.Router();

router.get("/:sectionKey", (req, res) => {
  try {
    const sectionKey = String(req.params.sectionKey || "").trim();
    logAdoptionEvent("help_viewed", { sectionKey });
    const content = getHelpContent(sectionKey);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...content });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "help_failed" });
  }
});

module.exports = router;
