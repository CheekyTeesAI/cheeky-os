"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { getDealList } = require("../services/dealCloserService");

router.get("/api/deals", async (_req, res) => {
  try {
    const deals = await getDealList();
    return res.json({ success: true, data: deals });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "deals_list_failed" });
  }
});

router.post("/api/deals/:id/contacted", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable" });
    const updated = await prisma.order.update({
      where: { id: String(req.params.id || "") },
      data: {
        closeStatus: "CONTACTED",
        lastCloseTouch: new Date(),
      },
    });
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "deal_contact_failed" });
  }
});

router.post("/api/deals/:id/snooze", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const note = body.note == null ? null : String(body.note);
    const updated = await prisma.order.update({
      where: { id: String(req.params.id || "") },
      data: {
        closeStatus: "SNOOZED",
        closeNotes: note,
        lastCloseTouch: new Date(),
      },
    });
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "deal_snooze_failed" });
  }
});

router.post("/api/deals/:id/paid", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable" });
    const updated = await prisma.order.update({
      where: { id: String(req.params.id || "") },
      data: {
        depositPaid: true,
        closeStatus: "PAID",
        lastCloseTouch: new Date(),
      },
    });
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "deal_paid_failed" });
  }
});

module.exports = router;
