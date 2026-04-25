"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { sendEmailReminder, sendSmsReminder } = require("../services/communicationService");

router.post("/send/:orderId", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
    });
    if (!order) {
      return res.json({ success: false, error: "Order not found", code: "ORDER_NOT_FOUND" });
    }

    const { channel = "EMAIL" } = req.body || {};
    let result;
    if (String(channel).toUpperCase() === "SMS") {
      result = await sendSmsReminder(order);
    } else {
      result = await sendEmailReminder(order);
    }
    return res.json({ success: true, data: { result } });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_send_failed",
      code: "FOLLOWUP_SEND_FAILED",
    });
  }
});

router.post("/done/:orderId", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const updated = await prisma.order.update({
      where: { id: req.params.orderId },
      data: { followupDone: true },
    });
    return res.json({ success: true, data: { orderId: updated.id, followupDone: updated.followupDone } });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_done_failed",
      code: "FOLLOWUP_DONE_FAILED",
    });
  }
});

module.exports = router;
