"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { safeSend } = require("../services/sendService");

router.post("/api/communications/approve/:id", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "DB_UNAVAILABLE", code: "DB_UNAVAILABLE" });

    const f = await prisma.revenueFollowup.findUnique({ where: { id: req.params.id } });
    if (!f) return res.json({ success: false, error: "NOT_FOUND", code: "NOT_FOUND" });

    const updated = await prisma.revenueFollowup.update({
      where: { id: f.id },
      data: { status: "APPROVED" },
    });
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "approve_failed",
      code: "APPROVE_FAILED",
    });
  }
});

router.post("/api/communications/send/:id", async (req, res) => {
  try {
    const { channel = "EMAIL", approvedSend = false, approvedBy = "owner" } = req.body || {};
    if (approvedSend !== true) {
      return res.json({ success: false, error: "APPROVAL_REQUIRED", code: "APPROVAL_REQUIRED" });
    }

    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "DB_UNAVAILABLE", code: "DB_UNAVAILABLE" });

    const f = await prisma.revenueFollowup.findUnique({ where: { id: req.params.id } });
    if (!f) return res.json({ success: false, error: "NOT_FOUND", code: "NOT_FOUND" });

    const result = await safeSend({ followUp: f, channel, approvedBy });
    if (!result.ok) {
      return res.json({ success: false, error: result.error || "send_failed", code: "SEND_FAILED" });
    }

    return res.json({
      success: true,
      data: { id: f.id, channel: String(channel || "EMAIL").toUpperCase(), message: result.message || "SENT" },
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "send_route_failed",
      code: "SEND_ROUTE_FAILED",
    });
  }
});

router.post("/api/communications/bulk-send", async (req, res) => {
  try {
    const { ids = [], channel = "EMAIL", approvedSend = false } = req.body || {};
    if (approvedSend !== true) {
      return res.json({ success: false, error: "APPROVAL_REQUIRED", code: "APPROVAL_REQUIRED" });
    }

    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "DB_UNAVAILABLE", code: "DB_UNAVAILABLE" });

    const results = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      const f = await prisma.revenueFollowup.findUnique({ where: { id: String(id) } });
      if (!f) {
        results.push({ id: String(id), ok: false, error: "NOT_FOUND" });
        continue;
      }
      const r = await safeSend({ followUp: f, channel, approvedBy: "bulk" });
      results.push({ id: String(id), ok: Boolean(r.ok), message: r.message || null, error: r.error || null });
    }

    return res.json({ success: true, data: results });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "bulk_send_failed",
      code: "BULK_SEND_FAILED",
    });
  }
});

module.exports = router;
