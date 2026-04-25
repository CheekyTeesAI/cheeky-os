"use strict";

const express = require("express");
const router = express.Router();

const { getNotifications, markSent, snooze } = require("../services/notificationService");

router.get("/api/notifications", async (_req, res) => {
  try {
    const list = await getNotifications();
    return res.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "notifications_fetch_failed",
    });
  }
});

router.post("/api/notifications/:id/sent", async (req, res) => {
  try {
    const updated = await markSent(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "notification_mark_sent_failed",
    });
  }
});

router.post("/api/notifications/:id/snooze", async (req, res) => {
  try {
    const updated = await snooze(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "notification_snooze_failed",
    });
  }
});

module.exports = router;
