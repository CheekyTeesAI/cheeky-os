"use strict";

const path = require("path");
const prisma = require("../prisma");
const actionAudit = require("../operator/actionAudit");
const sendEmailAction = require("../actions/sendEmailAction");

const followupPolicy = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "followupPolicy"
));

const followupTemplates = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "followupTemplates"
));

const state = {
  draftedToday: 0,
  sentToday: 0,
  blockedToday: 0,
  skippedToday: 0,
  lastRunAt: null,
  queue: [],
  audit: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_QUOTE_MS = 72 * 60 * 60 * 1000;

function pushAudit(entry) {
  const row = { timestamp: new Date().toISOString(), ...entry };
  state.audit.unshift(row);
  state.audit = state.audit.slice(0, 300);
  try {
    actionAudit({ type: "FOLLOWUP_AUTOMATION", ...row });
  } catch (_) {}
}

function policyBlock(type, entityId, reason) {
  state.blockedToday += 1;
  console.log(`[FOLLOWUP] BLOCKED BY POLICY | ${type} | ${entityId} | ${reason}`);
  pushAudit({ status: "blocked", type, entityId, reason });
}

function queueItem(item) {
  state.queue.unshift({
    generatedAt: new Date().toISOString(),
    ...item,
  });
  state.queue = state.queue.slice(0, 200);
}

async function getLastSentAt(orderId, kind) {
  if (!prisma || !orderId) return null;
  const latest = await prisma.revenueFollowup.findFirst({
    where: { orderId, kind, status: "SENT" },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  return latest && latest.sentAt ? latest.sentAt : null;
}

async function createDraftRecord(order, type, subject, body) {
  const fingerprint = `auto:${type}:${order.id}:${new Date().toISOString().slice(0, 13)}`;
  try {
    const existing = await prisma.revenueFollowup.findFirst({
      where: {
        orderId: order.id,
        kind: type,
        createdAt: { gt: new Date(Date.now() - DAY_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true },
    });
    if (existing) {
      state.skippedToday += 1;
      console.log(`[FOLLOWUP] SKIPPED | ${type} | ${order.id} | cooldown_active`);
      pushAudit({
        status: "skipped",
        type,
        entityType: "order",
        entityId: order.id,
        reason: "cooldown_active",
      });
      queueItem({
        entityId: order.id,
        entityType: "order",
        type,
        channel: "email",
        status: "skipped",
        reason: "cooldown_active",
        lastSentAt: existing.createdAt,
      });
      return null;
    }

    const rec = await prisma.revenueFollowup.create({
      data: {
        orderId: order.id,
        kind: type,
        subject,
        draftText: body,
        draftHtml: "",
        status: "DRAFT",
        fingerprint,
      },
      select: { id: true, createdAt: true },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: {
        lastFollowupAt: new Date(),
        followupCount: { increment: 1 },
      },
    });
    state.draftedToday += 1;
    console.log(`[FOLLOWUP] DRAFT CREATED | ${type} | ${order.id}`);
    pushAudit({
      status: "drafted",
      type,
      entityType: "order",
      entityId: order.id,
      followupId: rec.id,
    });
    queueItem({
      entityId: order.id,
      entityType: "order",
      type,
      channel: "email",
      status: "drafted",
      reason: "eligible",
      generatedAt: rec.createdAt,
    });
    return rec;
  } catch (err) {
    state.blockedToday += 1;
    pushAudit({
      status: "blocked",
      type,
      entityType: "order",
      entityId: order.id,
      reason: err && err.message ? err.message : String(err),
    });
    return null;
  }
}

async function maybeSendDraft(order, type, draftRecord, subject, body) {
  if (!draftRecord) return { sent: false };
  if (!followupPolicy.canAutoSendFollowup()) {
    return { sent: false };
  }

  if (!order.email) {
    state.skippedToday += 1;
    console.log(`[FOLLOWUP] SKIPPED | ${type} | ${order.id} | missing_contact`);
    pushAudit({
      status: "skipped",
      type,
      entityType: "order",
      entityId: order.id,
      reason: "missing_contact",
    });
    return { sent: false };
  }

  const latestOrder = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true, depositPaidAt: true, email: true },
  });
  if (!latestOrder || !latestOrder.email) {
    state.skippedToday += 1;
    console.log(`[FOLLOWUP] SKIPPED | ${type} | ${order.id} | linkage_or_contact_missing`);
    pushAudit({
      status: "skipped",
      type,
      entityType: "order",
      entityId: order.id,
      reason: "linkage_or_contact_missing",
    });
    return { sent: false };
  }

  if (String(type) === "DEPOSIT_FOLLOWUP" && latestOrder.depositPaidAt) {
    state.skippedToday += 1;
    console.log(`[FOLLOWUP] SKIPPED | ${type} | ${order.id} | deposit_already_paid`);
    pushAudit({
      status: "skipped",
      type,
      entityType: "order",
      entityId: order.id,
      reason: "deposit_already_paid",
    });
    return { sent: false };
  }

  const sendRes = await sendEmailAction({
    to: latestOrder.email,
    subject,
    message: body,
    source: "FOLLOWUP_AUTOMATION",
    followupType: type,
    entityId: order.id,
  });
  if (!sendRes || !sendRes.success) {
    state.blockedToday += 1;
    console.log(`[FOLLOWUP] BLOCKED | ${type} | ${order.id} | send_failed_or_blocked`);
    pushAudit({
      status: "blocked",
      type,
      entityType: "order",
      entityId: order.id,
      reason: "send_failed_or_blocked",
    });
    await prisma.sendLog.create({
      data: {
        followUpId: draftRecord.id,
        orderId: order.id,
        channel: "email",
        idempotency: `followup:${type}:${order.id}:${Date.now()}`,
        status: "BLOCKED",
        error: sendRes && sendRes.error ? sendRes.error : "send_failed_or_blocked",
      },
    });
    return { sent: false };
  }

  await prisma.revenueFollowup.update({
    where: { id: draftRecord.id },
    data: { status: "SENT", sentAt: new Date(), sentBy: "AUTOPILOT_SUPERVISED" },
  });
  await prisma.sendLog.create({
    data: {
      followUpId: draftRecord.id,
      orderId: order.id,
      channel: "email",
      idempotency: `followup:${type}:${order.id}:${Date.now()}`,
      status: "SENT",
    },
  });
  state.sentToday += 1;
  console.log(`[FOLLOWUP] SENT | ${type} | ${order.id}`);
  pushAudit({
    status: "sent",
    type,
    entityType: "order",
    entityId: order.id,
    followupId: draftRecord.id,
  });
  return { sent: true };
}

async function processOrder(order) {
  const ageMs = Date.now() - new Date(order.createdAt).getTime();
  const staleQuote = ageMs > STALE_QUOTE_MS;
  const followupType = staleQuote ? "STALE_QUOTE_NUDGE" : "DEPOSIT_FOLLOWUP";
  const lastSentAt = await getLastSentAt(order.id, followupType);

  const allowed = followupPolicy.canFollowUpOrder(order, followupType, {
    lastSentAt,
    linkageMissing: !order.id,
    confidenceLow: !order.customerName,
  });
  if (!allowed) {
    policyBlock(followupType, order.id, "policy_rejected");
    queueItem({
      entityId: order.id,
      entityType: "order",
      type: followupType,
      channel: "email",
      status: "blocked",
      reason: "policy_rejected",
      lastSentAt,
    });
    return "blocked";
  }

  if (!order.email) {
    state.skippedToday += 1;
    console.log(`[FOLLOWUP] SKIPPED | ${followupType} | ${order.id} | missing_contact`);
    pushAudit({
      status: "skipped",
      type: followupType,
      entityType: "order",
      entityId: order.id,
      reason: "missing_contact",
    });
    queueItem({
      entityId: order.id,
      entityType: "order",
      type: followupType,
      channel: "email",
      status: "skipped",
      reason: "missing_contact",
      lastSentAt,
    });
    return "skipped";
  }

  const template =
    followupType === "STALE_QUOTE_NUDGE"
      ? followupTemplates.createStaleQuoteNudgeDraft(order)
      : followupTemplates.createDepositFollowupDraft(order);

  const draft = await createDraftRecord(order, followupType, template.subject, template.body);
  await maybeSendDraft(order, followupType, draft, template.subject, template.body);
  return "ok";
}

async function runFollowupAutomation() {
  const summary = { drafted: 0, sent: 0, skipped: 0, blocked: 0 };
  try {
    if (!followupPolicy.isFollowupEnabled()) {
      policyBlock("FOLLOWUP_AUTOMATION", "global", "AUTO_FOLLOWUP_not_enabled");
      return { success: false, blocked: true, summary };
    }
    if (!prisma) {
      policyBlock("FOLLOWUP_AUTOMATION", "global", "prisma_unavailable");
      return { success: false, blocked: true, summary };
    }

    const now = Date.now();
    const old24 = new Date(now - DAY_MS);
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ["QUOTE_SENT", "ATTENTION_REQUIRED"] },
        depositPaidAt: null,
        createdAt: { lt: old24 },
      },
      select: {
        id: true,
        status: true,
        customerName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
      take: 30,
    });

    const leads = await prisma.lead.findMany({
      where: {
        paymentStatus: "UNPAID",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        orderId: true,
        updatedAt: true,
      },
      take: 20,
    });

    for (const order of orders) {
      try {
        const r = await processOrder(order);
        if (r === "blocked") summary.blocked += 1;
        else if (r === "skipped") summary.skipped += 1;
      } catch (err) {
        summary.blocked += 1;
        pushAudit({
          status: "blocked",
          type: "ORDER_FOLLOWUP",
          entityType: "order",
          entityId: order.id,
          reason: err && err.message ? err.message : String(err),
        });
      }
    }

    for (const lead of leads) {
      try {
        const leadAllowed = followupPolicy.canFollowUpLead(lead, "DEPOSIT_FOLLOWUP", {
          linkageMissing: !lead.orderId,
          confidenceLow: !lead.name,
        });
        if (!leadAllowed || !lead.orderId) {
          state.skippedToday += 1;
          console.log(`[FOLLOWUP] SKIPPED | LEAD_REVIEW | ${lead.id} | weak_linkage_or_policy`);
          pushAudit({
            status: "skipped",
            type: "LEAD_REVIEW",
            entityType: "lead",
            entityId: lead.id,
            reason: "weak_linkage_or_policy",
          });
        }
      } catch (err) {
        state.blockedToday += 1;
        pushAudit({
          status: "blocked",
          type: "LEAD_REVIEW",
          entityType: "lead",
          entityId: lead.id,
          reason: err && err.message ? err.message : String(err),
        });
      }
    }

    state.lastRunAt = new Date().toISOString();
    summary.drafted = state.draftedToday;
    summary.sent = state.sentToday;
    summary.blocked = state.blockedToday;
    summary.skipped = state.skippedToday;
    pushAudit({
      status: "run_complete",
      type: "FOLLOWUP_AUTOMATION",
      entityType: "system",
      entityId: "scheduler",
      reason: JSON.stringify(summary),
    });
    return { success: true, summary };
  } catch (err) {
    state.blockedToday += 1;
    state.lastRunAt = new Date().toISOString();
    pushAudit({
      status: "run_failed",
      type: "FOLLOWUP_AUTOMATION",
      entityType: "system",
      entityId: "scheduler",
      reason: err && err.message ? err.message : String(err),
    });
    return { success: false, error: err && err.message ? err.message : String(err), summary };
  }
}

function getFollowupsStatus() {
  return {
    mode: String(process.env.FOLLOWUP_MODE || "draft_only"),
    autoSend: String(process.env.FOLLOWUP_AUTO_SEND || "false").toLowerCase() === "true",
    draftedToday: state.draftedToday,
    sentToday: state.sentToday,
    blockedToday: state.blockedToday,
    skippedToday: state.skippedToday,
    timestamp: new Date().toISOString(),
  };
}

function getFollowupsQueue() {
  return {
    success: true,
    items: state.queue.slice(0, 100),
    timestamp: new Date().toISOString(),
  };
}

function getFollowupsAudit() {
  return {
    success: true,
    items: state.audit.slice(0, 150),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  runFollowupAutomation,
  getFollowupsStatus,
  getFollowupsQueue,
  getFollowupsAudit,
};
