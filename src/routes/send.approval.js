"use strict";

const express = require("express");
const router = express.Router();
const { safeSend } = require("../services/sendService");
const {
  CHEEKY_approveFollowup,
  CHEEKY_sendFollowupById,
  CHEEKY_bulkFetchFollowups,
} = require("../services/revenueFollowupService");

router.post("/api/communications/approve/:id", async (req, res) => {
  // [CHEEKY-GATE] Delegated to revenueFollowupService.CHEEKY_approveFollowup.
  try {
    const out = await CHEEKY_approveFollowup(req.params.id);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    return res.json(out);
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "approve_failed", code: "APPROVE_FAILED" }); }
});

router.post("/api/communications/send/:id", async (req, res) => {
  // [CHEEKY-GATE] Delegated to revenueFollowupService.CHEEKY_sendFollowupById (lookup) + safeSend.
  try {
    const { channel = "EMAIL", approvedSend = false, approvedBy = "owner" } = req.body || {};
    if (approvedSend !== true) return res.json({ success: false, error: "APPROVAL_REQUIRED", code: "APPROVAL_REQUIRED" });
    const out = await CHEEKY_sendFollowupById(req.params.id);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code });
    const result = await safeSend({ followUp: out.followup, channel, approvedBy });
    if (!result.ok) return res.json({ success: false, error: result.error || "send_failed", code: "SEND_FAILED" });
    return res.json({ success: true, data: { id: out.followup.id, channel: String(channel || "EMAIL").toUpperCase(), message: result.message || "SENT" } });
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "send_route_failed", code: "SEND_ROUTE_FAILED" }); }
});

router.post("/api/communications/bulk-send", async (req, res) => {
  // [CHEEKY-GATE] Delegated to revenueFollowupService.CHEEKY_bulkFetchFollowups + safeSend loop.
  try {
    const { ids = [], channel = "EMAIL", approvedSend = false } = req.body || {};
    if (approvedSend !== true) return res.json({ success: false, error: "APPROVAL_REQUIRED", code: "APPROVAL_REQUIRED" });
    const fetched = await CHEEKY_bulkFetchFollowups(ids);
    if (!fetched.success) return res.json({ success: false, error: fetched.error, code: fetched.code });
    const results = [];
    for (const item of fetched.items) {
      if (item.notFound) { results.push({ id: item.id, ok: false, error: "NOT_FOUND" }); continue; }
      const r = await safeSend({ followUp: item.followup, channel, approvedBy: "bulk" });
      results.push({ id: item.id, ok: Boolean(r.ok), message: r.message || null, error: r.error || null });
    }
    return res.json({ success: true, data: results });
  } catch (e) { return res.json({ success: false, error: e && e.message ? e.message : "bulk_send_failed", code: "BULK_SEND_FAILED" }); }
});

module.exports = router;
