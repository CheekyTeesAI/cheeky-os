"use strict";

const express = require("express");

const notificationService = require("../notifications/notificationService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json());

router.get("/api/notifications", async (_req, res) => {
  try {
    const data = notificationService.listNotifications();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Notifications unavailable safely.", technicalCode: "notif_list_fail" }), {
        data: { items: [], unreadCount: 0 },
      })
    );
  }
});

router.post("/api/notifications/mark-read", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const ids = Array.isArray(b.ids) ? b.ids : [];
    const all = !!b.all;
    notificationService.markRead(ids, all);
    return res.json({ success: true, message: "Updated read states locally only." });
  } catch (_e2) {
    return res.status(200).json(safeFailureResponse({ safeMessage: "Could not mark notifications read.", technicalCode: "notif_read_fail" }));
  }
});

module.exports = router;
