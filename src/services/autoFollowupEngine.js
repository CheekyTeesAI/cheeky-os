"use strict";

const crypto = require("crypto");
const { getPrisma } = require("./decisionEngine");
const { getEligibleOrders } = require("./followupRulesService");

function makeFingerprint(orderId, count) {
  const raw = `${orderId}:AUTO_PAYMENT_REMINDER:${count}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function runAutoFollowups() {
  const prisma = getPrisma();
  if (!prisma) {
    console.log("[AUTO FOLLOWUP ERROR] DB_UNAVAILABLE");
    return;
  }

  try {
    const eligible = await getEligibleOrders();

    for (const order of eligible) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.order.findUnique({
          where: { id: order.id },
          select: {
            id: true,
            customerName: true,
            followupCount: true,
            lastFollowupAt: true,
            squareInvoiceId: true,
            depositPaid: true,
            followupDone: true,
          },
        });
        if (!fresh) return;
        if (!fresh.squareInvoiceId || fresh.depositPaid || fresh.followupDone) return;

        const cooldown = parseInt(process.env.FOLLOWUP_COOLDOWN_HOURS || "24", 10);
        const maxPerOrder = parseInt(process.env.FOLLOWUP_MAX_PER_ORDER || "3", 10);
        const ageHours = fresh.lastFollowupAt
          ? (Date.now() - new Date(fresh.lastFollowupAt).getTime()) / 3600000
          : Infinity;

        if ((fresh.followupCount || 0) >= maxPerOrder) return;
        if (ageHours < cooldown) return;

        const nextCount = (fresh.followupCount || 0) + 1;
        await tx.revenueFollowup.create({
          data: {
            orderId: fresh.id,
            kind: "AUTO_PAYMENT_REMINDER",
            status: "READY",
            subject: "Deposit Reminder",
            draftText: `Hey ${fresh.customerName || ""}, just checking in on your order deposit.`,
            draftHtml: `<p>Hey ${fresh.customerName || ""},</p><p>Just checking in on your order deposit.</p>`,
            fingerprint: makeFingerprint(fresh.id, nextCount),
          },
        });

        await tx.order.update({
          where: { id: fresh.id },
          data: {
            lastFollowupAt: new Date(),
            followupCount: { increment: 1 },
          },
        });
      });

      console.log("[AUTO FOLLOWUP CREATED]", order.id);
    }
  } catch (e) {
    console.log("[AUTO FOLLOWUP ERROR]", e && e.message ? e.message : e);
  }
}

module.exports = { runAutoFollowups };
