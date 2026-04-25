"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const {
  createLead,
  getLeads,
  getDueFollowUps,
  markContacted,
  createFollowUpForLead,
  updateNextFollowUp,
  CHEEKY_triggerLeadFollowup,
  CHEEKY_convertLead,
} = require("../services/leadService");

router.post("/api/leads", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });

    const lead = await createLead(req.body || {});
    return res.json({ success: true, data: lead });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "lead_create_failed",
      code: "LEAD_CREATE_FAILED",
    });
  }
});

router.get("/api/leads", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    const leads = await getLeads();
    return res.json({ success: true, data: leads });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "lead_fetch_failed",
      code: "LEAD_FETCH_FAILED",
    });
  }
});

router.get("/api/leads/followups", async (_req, res) => {
  try {
    const list = await getDueFollowUps();
    return res.json({ success: true, data: list });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "lead_followups_fetch_failed",
      code: "LEAD_FOLLOWUPS_FETCH_FAILED",
    });
  }
});

router.post("/api/leads/:id/contacted", async (req, res) => {
  try {
    const updated = await markContacted(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "lead_contacted_failed",
      code: "LEAD_CONTACTED_FAILED",
    });
  }
});

router.post("/api/leads/:id/followup", async (req, res) => {
  // [CHEEKY-GATE] Delegated to leadService.CHEEKY_triggerLeadFollowup.
  try {
    const out = await CHEEKY_triggerLeadFollowup(req.params.id);
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : out.code === "LEAD_NOT_FOUND" ? 404 : 500;
      return res.json({ success: false, error: out.error, code: out.code });
    }
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_failed",
      code: "FOLLOWUP_FAILED",
    });
  }
});

router.post("/api/leads/:id/convert", async (req, res) => {
  // [CHEEKY-GATE] Delegated to leadService.CHEEKY_convertLead.
  try {
    const out = await CHEEKY_convertLead(req.params.id);
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : out.code === "LEAD_NOT_FOUND" ? 404 : 500;
      return res.json({ success: false, error: out.error, code: out.code });
    }
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "lead_convert_failed",
      code: "LEAD_CONVERT_FAILED",
    });
  }
});

module.exports = router;
