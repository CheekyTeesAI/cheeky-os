"use strict";

const crypto = require("crypto");
const { getPrisma } = require("./decisionEngine");
const { getRevenueOpportunities } = require("./revenuePriorityService");

let started = false;

function hashKey(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDraft(kind, customerName) {
  const name = customerName || "there";
  if (kind === "PICKUP_REMINDER") {
    return {
      subject: "Your order is ready for pickup",
      draftText: `Hey ${name}, your order is ready for pickup. We can hold it at the shop and coordinate a pickup time that works for you.`,
      draftHtml: `<p>Hey ${esc(name)},</p><p>Your order is ready for pickup. We can hold it at the shop and coordinate a pickup time that works for you.</p>`,
    };
  }
  if (kind === "ESTIMATE_STALE") {
    return {
      subject: "Quick follow-up on your quote",
      draftText: `Hey ${name}, just checking in on your quote. If you want to move forward, I can lock this in and prep the next step for you.`,
      draftHtml: `<p>Hey ${esc(name)},</p><p>Just checking in on your quote. If you want to move forward, I can lock this in and prep the next step for you.</p>`,
    };
  }
  return {
    subject: "Quick follow-up on your shirt order",
    draftText: `Hey ${name}, just checking in on your order. We’re ready to move forward as soon as we receive your deposit. Let me know if you have any questions!`,
    draftHtml: `<p>Hey ${esc(name)},</p><p>Just checking in on your order. We’re ready to move forward as soon as we receive your deposit. Let me know if you have any questions!</p>`,
  };
}

async function upsertDraft(tx, orderId, kind, customerName, reasonDate) {
  const d = buildDraft(kind, customerName);
  const fp = hashKey([String(orderId), kind, String(reasonDate).slice(0, 10)]);
  const existing = await tx.revenueFollowup.findUnique({ where: { fingerprint: fp } });
  if (existing) return { created: false, followup: existing };
  const created = await tx.revenueFollowup.create({
    data: {
      orderId,
      kind,
      subject: d.subject,
      draftText: d.draftText,
      draftHtml: d.draftHtml,
      fingerprint: fp,
      status: "DRAFT",
    },
  });
  return { created: true, followup: created };
}

async function runRevenueFollowupScan() {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    console.log("[REVENUE ENGINE] Running follow-up scan");
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 86400000);
    const oneDayAgo = new Date(now - 1 * 86400000);

    const [depositPending, pickupReady, staleEstimates] = await Promise.all([
      prisma.order.findMany({
        where: { status: "AWAITING_DEPOSIT", createdAt: { lte: twoDaysAgo } },
        select: { id: true, customerName: true, createdAt: true },
        take: 500,
      }),
      prisma.order.findMany({
        where: { status: "READY", qcComplete: true, updatedAt: { lte: oneDayAgo } },
        select: { id: true, customerName: true, updatedAt: true },
        take: 500,
      }),
      prisma.estimate.findMany({
        where: { status: { in: ["DRAFT", "APPROVED"] }, createdAt: { lte: twoDaysAgo } },
        select: { id: true, name: true, createdAt: true, orderId: true },
        take: 500,
      }),
    ]);

    const created = [];
    await prisma.$transaction(async (tx) => {
      for (const o of depositPending) {
        const out = await upsertDraft(tx, o.id, "DEPOSIT_PENDING", o.customerName, o.createdAt);
        if (out.created) created.push(out.followup.id);
      }
      for (const o of pickupReady) {
        const out = await upsertDraft(tx, o.id, "PICKUP_REMINDER", o.customerName, o.updatedAt);
        if (out.created) created.push(out.followup.id);
      }
      for (const e of staleEstimates) {
        if (!e.orderId) continue;
        const out = await upsertDraft(tx, e.orderId, "ESTIMATE_STALE", e.name, e.createdAt);
        if (out.created) created.push(out.followup.id);
      }
    });

    const opp = await getRevenueOpportunities(20);
    return {
      success: true,
      data: {
        createdCount: created.length,
        createdIds: created,
        topMoneyMoves: opp.success ? opp.data.opportunities.slice(0, 5) : [],
      },
    };
  } catch (err) {
    console.error("[revenueFollowupService.runRevenueFollowupScan]", err && err.stack ? err.stack : err);
    return { success: false, error: err && err.message ? err.message : "scan_failed", code: "SCAN_FAILED" };
  } finally {
    console.log("[SAFE EXIT] Completed without background persistence");
  }
}

function startRevenueFollowupCron() {
  if (started) return;
  started = true;
  // Low-energy mode: on-demand only, no background schedulers.
  console.log("[SAFE MODE] Revenue follow-up cron disabled; use POST /api/revenue/followups/run");
  console.log("[SAFE EXIT] Completed without background persistence");
}

// [CHEEKY-GATE] CHEEKY_listCommunicationQueue — extracted from GET /api/communications/queue.
// Pure relocation: revenueFollowup.findMany READY|APPROVED desc.
async function CHEEKY_listCommunicationQueue() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  const drafts = await prisma.revenueFollowup.findMany({
    where: { status: { in: ["READY", "APPROVED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { success: true, data: drafts };
}

module.exports = {
  runRevenueFollowupScan,
  startRevenueFollowupCron,
  CHEEKY_listCommunicationQueue,
};
