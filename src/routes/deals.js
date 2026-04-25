"use strict";

const express = require("express");
const router = express.Router();
const { getDealList, CHEEKY_contactDeal, CHEEKY_snoozeDeal, CHEEKY_markDealPaid } = require("../services/dealCloserService");

router.get("/api/deals", async (_req, res) => {
  try {
    const deals = await getDealList();
    return res.json({ success: true, data: deals });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "deals_list_failed" });
  }
});

router.post("/api/deals/:id/contacted", async (req, res) => {
  // [CHEEKY-GATE] Delegated to dealCloserService.CHEEKY_contactDeal.
  try {
    const out = await CHEEKY_contactDeal(req.params.id);
    if (!out.success) return res.json({ success: false, error: out.error });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "deal_contact_failed" }); }
});

router.post("/api/deals/:id/snooze", async (req, res) => {
  // [CHEEKY-GATE] Delegated to dealCloserService.CHEEKY_snoozeDeal.
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await CHEEKY_snoozeDeal(req.params.id, body.note);
    if (!out.success) return res.json({ success: false, error: out.error });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "deal_snooze_failed" }); }
});

router.post("/api/deals/:id/paid", async (req, res) => {
  // [CHEEKY-GATE] Delegated to dealCloserService.CHEEKY_markDealPaid.
  try {
    const out = await CHEEKY_markDealPaid(req.params.id);
    if (!out.success) return res.json({ success: false, error: out.error });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "deal_paid_failed" }); }
});

module.exports = router;
