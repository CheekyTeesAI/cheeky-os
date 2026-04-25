"use strict";

const { getPrisma } = require("./decisionEngine");
const { sendEmailReal, sendSmsReal } = require("./providerService");

async function safeSend({ followUp, channel, approvedBy }) {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "DB_UNAVAILABLE" };

  const ch = String(channel || "EMAIL").toUpperCase();
  const idempotency = `${followUp.id}:${ch}`;

  const existing = await prisma.sendLog.findUnique({ where: { idempotency } }).catch(() => null);
  if (existing && existing.status === "SENT") {
    return { ok: true, message: "ALREADY_SENT" };
  }

  try {
    let providerResult = null;

    if (ch === "EMAIL") {
      if (!followUp.draftHtml && !followUp.draftText) {
        throw new Error("EMAIL_DRAFT_MISSING");
      }

      const order = await prisma.order.findUnique({ where: { id: followUp.orderId } });
      const to = order && order.email ? order.email : null;
      if (!to) throw new Error("ORDER_EMAIL_MISSING");

      providerResult = await sendEmailReal({
        to,
        subject: followUp.subject || followUp.kind || "FOLLOWUP",
        html: followUp.draftHtml || undefined,
        text: followUp.draftText || undefined,
      });
    } else if (ch === "SMS") {
      const order = await prisma.order.findUnique({ where: { id: followUp.orderId } });
      const to = order && order.phone ? order.phone : null;
      if (!to) throw new Error("ORDER_PHONE_MISSING");

      providerResult = await sendSmsReal({
        to,
        body: followUp.draftText || followUp.subject || followUp.kind || "Order update",
      });
    } else {
      throw new Error("CHANNEL_NOT_SUPPORTED");
    }

    await prisma.sendLog.upsert({
      where: { idempotency },
      update: { status: "SENT", error: null },
      create: {
        followUpId: followUp.id,
        orderId: followUp.orderId,
        channel: ch,
        idempotency,
        status: "SENT",
      },
    });

    await prisma.revenueFollowup.update({
      where: { id: followUp.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sentBy: approvedBy || "system",
      },
    });

    return { ok: true, providerResult };
  } catch (e) {
    const message = e && e.message ? e.message : "send_failed";
    await prisma.sendLog
      .upsert({
        where: { idempotency },
        update: { status: "FAILED", error: message },
        create: {
          followUpId: followUp.id,
          orderId: followUp.orderId,
          channel: ch,
          idempotency,
          status: "FAILED",
          error: message,
        },
      })
      .catch(() => null);
    return { ok: false, error: message };
  }
}

module.exports = { safeSend };
