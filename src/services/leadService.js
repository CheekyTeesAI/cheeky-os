"use strict";

const { getPrisma } = require("./decisionEngine");
const { createNotification } = require("./notificationService");

async function createLead(data) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return prisma.lead.create({
    data: {
      name: (data && data.name) || "Unknown",
      company: (data && data.company) || null,
      phone: (data && data.phone) || null,
      email: (data && data.email) || null,
      notes: (data && data.notes) || "",
      source: (data && data.source) || "COLD_CALL",
      status: "NEW",
      nextFollowUp: next,
      nextFollowUpAt: next,
    },
  });
}

async function getLeads() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

async function getDueFollowUps() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.lead.findMany({
    where: {
      OR: [{ nextFollowUp: { lte: new Date() } }, { nextFollowUpAt: { lte: new Date() } }],
      status: { not: "CLOSED" },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function markContacted(id) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  const next = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const updated = await prisma.lead.update({
    where: { id: String(id || "") },
    data: {
      status: "CONTACTED",
      lastContactAt: new Date(),
      nextFollowUp: next,
      nextFollowUpAt: next,
    },
  });

  try {
    await createNotification({
      type: "LEAD_FOLLOWUP",
      entityId: String(id || ""),
      customerName: updated.name || "Lead",
      messageText: "Follow up with this lead again soon",
    });
  } catch (_e) {
    /* keep lead flow non-blocking */
  }

  return updated;
}

async function ensureLeadOrder(lead) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  if (lead.orderId) {
    const existing = await prisma.order.findUnique({ where: { id: lead.orderId } });
    if (existing) return existing;
  }

  const order = await prisma.order.create({
    data: {
      customerName: lead.name || lead.company || "Lead Customer",
      email: lead.email || `${lead.id}@lead.cheeky.local`,
      phone: lead.phone || null,
      notes: lead.notes || "Lead follow-up staging order",
      status: "INTAKE",
      source: "LEAD_PIPELINE",
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { orderId: order.id },
  });

  return order;
}

async function createFollowUpForLead(lead) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  if (!lead.email && !lead.phone) {
    return null;
  }

  const order = await ensureLeadOrder(lead);
  const draftText =
    "Hey " +
    (lead.name || "") +
    ", just following up from earlier. Let me know if you need anything for shirts or printing.";
  const draftHtml =
    "<p>Hey " +
    (lead.name || "") +
    ",</p><p>Just following up from earlier. Let me know if you need anything for shirts or printing.</p>";

  const fingerprint = `lead:${lead.id}:${new Date().toISOString().slice(0, 10)}`;
  return prisma.revenueFollowup.create({
    data: {
      orderId: order.id,
      kind: "LEAD_FOLLOWUP",
      status: "READY",
      subject: "Follow-up",
      draftText,
      draftHtml,
      fingerprint,
    },
  });
}

async function updateNextFollowUp(leadId, days = 2) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  const next = new Date();
  next.setDate(next.getDate() + days);
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      nextFollowUpAt: next,
      status: "FOLLOW_UP",
      lastContactAt: new Date(),
    },
  });
}

// [CHEEKY-GATE] CHEEKY_triggerLeadFollowup — extracted from POST /api/leads/:id/followup.
// Pure relocation: findUnique guard + createFollowUpForLead + updateNextFollowUp.
async function CHEEKY_triggerLeadFollowup(leadId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const lead = await prisma.lead.findUnique({ where: { id: String(leadId || "") } });
  if (!lead) return { success: false, error: "Lead not found", code: "LEAD_NOT_FOUND" };
  const followUp = await createFollowUpForLead(lead);
  await updateNextFollowUp(lead.id);
  return { success: true, data: followUp };
}

// [CHEEKY-GATE] CHEEKY_convertLead — extracted from POST /api/leads/:id/convert.
// Pure relocation: lead lookup, order upsert, lead status update.
async function CHEEKY_convertLead(leadId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const lead = await prisma.lead.findUnique({ where: { id: String(leadId || "") } });
  if (!lead) return { success: false, error: "Lead not found", code: "LEAD_NOT_FOUND" };

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
    data: { status: "WON", orderId: order.id, lastContactAt: new Date() },
  });

  return { success: true, data: order };
}

module.exports = {
  createLead,
  getLeads,
  getDueFollowUps,
  markContacted,
  createFollowUpForLead,
  updateNextFollowUp,
  CHEEKY_triggerLeadFollowup,
  CHEEKY_convertLead,
};
