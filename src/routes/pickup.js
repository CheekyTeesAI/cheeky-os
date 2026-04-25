"use strict";

const express = require("express");
const router = express.Router();
const { CHEEKY_listPickupReady, CHEEKY_markPickupNotified } = require("../services/orderService");

router.get("/api/pickup", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_listPickupReady.
  try {
    const out = await CHEEKY_listPickupReady();
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : "pickup_list_failed", code: "PICKUP_LIST_FAILED" });
  }
});

router.post("/api/pickup/:id/notified", async (req, res) => {
  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_markPickupNotified.
  try {
    const out = await CHEEKY_markPickupNotified(req.params.id);
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : "pickup_mark_notified_failed", code: "PICKUP_MARK_NOTIFIED_FAILED" });
  }
});

module.exports = router;
