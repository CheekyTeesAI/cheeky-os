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
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) {
      return res.json({ success: false, error: "Lead not found", code: "LEAD_NOT_FOUND" });
    }
    const followUp = await createFollowUpForLead(lead);
    await updateNextFollowUp(lead.id);
    return res.json({ success: true, data: followUp });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "followup_failed",
      code: "FOLLOWUP_FAILED",
    });
  }
});

router.post("/api/leads/:id/convert", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) {
      return res.json({ success: false, error: "Lead not found", code: "LEAD_NOT_FOUND" });
    }

    let order = null;
    if (lead.orderId) {
      order = await prisma.order.update({
        where: { id: lead.orderId },
        data: {
          customerName: lead.name || lead.company || "New Customer",
          email: lead.email || `${lead.id}@lead.cheeky.local`,
          phone: lead.phone || null,
          status: "INTAKE",
        },
      });
    } else {
      order = await prisma.order.create({
        data: {
          customerName: lead.name || lead.company || "New Customer",
          email: lead.email || `${lead.id}@lead.cheeky.local`,
          phone: lead.phone || null,
          status: "INTAKE",
          source: "LEAD_PIPELINE",
        },
      });
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: "WON",
        orderId: order.id,
        lastContactAt: new Date(),
      },
    });

    return res.json({ success: true, data: order });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "lead_convert_failed",
      code: "LEAD_CONVERT_FAILED",
    });
  }
});

module.exports = router;
