"use strict";

const express = require("express");
const router = express.Router();
const {
  CHEEKY_sendFollowupReminder,
  CHEEKY_markFollowupDone,
} = require("../services/orderService");

router.post("/send/:orderId", async (req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_sendFollowupReminder.
  try {
    const { channel = "EMAIL" } = req.body || {};
    const out = await CHEEKY_sendFollowupReminder(req.params.orderId, channel);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code || "FOLLOWUP_SEND_FAILED" });
    return res.json(out);
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_send_failed",
      code: "FOLLOWUP_SEND_FAILED",
    });
  }
});

router.post("/done/:orderId", async (req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_markFollowupDone.
  try {
    const out = await CHEEKY_markFollowupDone(req.params.orderId);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code || "FOLLOWUP_DONE_FAILED" });
    return res.json(out);
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_done_failed",
      code: "FOLLOWUP_DONE_FAILED",
    });
  }
});

module.exports = router;
